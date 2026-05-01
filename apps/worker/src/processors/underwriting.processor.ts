import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobRunStatus,
  TimelineActorType,
  TimelineEntityType,
  PrismaClient,
} from '@prisma/client';
import * as crypto from 'crypto';
import OpenAI from 'openai';
import { assertPolicy, prompts, renderPrompt } from '@halo/shared';

const prisma = new PrismaClient();

@Processor('underwriting')
export class UnderwritingProcessor extends WorkerHost {
  private _openai: OpenAI | null = null;

  private get openai(): OpenAI {
    if (!this._openai) {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is required');
      }
      this._openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this._openai;
  }

  async process(
    job: Job<{
      jobRunId: string;
      tenantId: string;
      dealId: string;
      actorId?: string | null;
    }>,
  ) {
    const { jobRunId, tenantId, dealId, actorId } = job.data;

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: { status: JobRunStatus.RUNNING, attempts: { increment: 1 } },
    });

    try {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, accountId: tenantId },
        include: {
          property: { include: { sourceRecords: true } },
          lead: true,
        },
      });
      if (!deal) {
        throw new Error(`Deal ${dealId} not found in tenant ${tenantId}`);
      }

      const controlPlane = await this.getControlPlane();
      const todayCost = await this.getTodayCost(tenantId);
      const globalTodayCost = await this.getTodayCost();
      const dailyCap = parseFloat(process.env.OPENAI_DAILY_COST_CAP || '2.0');

      assertPolicy({
        tenantId,
        actorId: actorId || null,
        actorType: 'system',
        now: new Date(),
        requestedAction: 'underwriting.execute',
        channel: 'ai_underwrite',
        dealId,
        dailySpendUsd: todayCost,
        dailyCapUsd: dailyCap,
        perTenantCapUsd: dailyCap,
        globalDailySpendUsd: globalTodayCost,
        globalDailyCapUsd: dailyCap,
        sideEffectsEnabled: controlPlane.enabled,
        aiEnabled: controlPlane.enabled && controlPlane.externalDataEnabled,
      });

      const propertyData = {
        address: deal.property?.address,
        city: deal.property?.city,
        state: deal.property?.state,
        zip: deal.property?.zip,
        apn: deal.property?.apn,
        sourceRecords: deal.property?.sourceRecords || [],
      };

      const prompt = renderPrompt(prompts.underwriting.user, {
        propertyData: JSON.stringify(propertyData, null, 2),
        marketContext: 'Standard wholesale market analysis',
      });

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: prompts.underwriting.system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      });

      const response = completion.choices[0].message.content || '';
      const analysis = this.parseAnalysis(response);
      const cost = this.estimateCost(
        completion.usage?.prompt_tokens || 0,
        completion.usage?.completion_tokens || 0,
      );

      await prisma.aICostLog.create({
        data: {
          provider: 'openai',
          model: 'gpt-4',
          tokensIn: completion.usage?.prompt_tokens,
          tokensOut: completion.usage?.completion_tokens,
          cost,
          accountId: tenantId,
        },
      });

      await prisma.underwritingResult.upsert({
        where: { dealId },
        create: {
          dealId,
          propertyId: deal.propertyId || undefined,
          arv: analysis.arv,
          repairEstimate: analysis.repairEstimate,
          mao: analysis.mao,
          confidence: analysis.confidence,
          rationale: analysis.rationale,
          compsSummary: analysis.compsSummary,
          evaluationMetadata: {
            model: 'gpt-4',
            tokensUsed: completion.usage?.total_tokens,
            cost,
          },
        },
        update: {
          arv: analysis.arv,
          repairEstimate: analysis.repairEstimate,
          mao: analysis.mao,
          confidence: analysis.confidence,
          rationale: analysis.rationale,
          compsSummary: analysis.compsSummary,
          evaluationMetadata: {
            model: 'gpt-4',
            tokensUsed: completion.usage?.total_tokens,
            cost,
          },
        },
      });

      await prisma.deal.update({
        where: { id: dealId },
        data: {
          arv: analysis.arv,
          repairEstimate: analysis.repairEstimate,
          mao: analysis.mao,
        },
      });

      const result = {
        arv: analysis.arv,
        repairEstimate: analysis.repairEstimate,
        mao: analysis.mao,
        confidence: analysis.confidence,
        rationale: analysis.rationale,
      };
      const resultHash = crypto
        .createHash('sha256')
        .update(JSON.stringify(result))
        .digest('hex');

      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: JobRunStatus.SUCCEEDED,
          resultJson: result as any,
          resultHash,
          error: null,
        },
      });

      await prisma.timelineEvent.create({
        data: {
          tenantId,
          entityType: TimelineEntityType.JOB,
          entityId: jobRunId,
          eventType: 'UNDERWRITE_COMPLETED',
          payloadJson: { dealId, resultHash },
          actorId: actorId || null,
          actorType: TimelineActorType.system,
        },
      });

      return { success: true, jobRunId, result };
    } catch (error) {
      await prisma.jobRun.update({
        where: { id: jobRunId },
        data: {
          status: JobRunStatus.FAILED,
          error: (error as Error).message,
        },
      });

      await prisma.timelineEvent.create({
        data: {
          tenantId,
          entityType: TimelineEntityType.JOB,
          entityId: jobRunId,
          eventType: 'UNDERWRITE_FAILED',
          payloadJson: { error: (error as Error).message },
          actorId: actorId || null,
          actorType: TimelineActorType.system,
        },
      });

      throw error;
    }
  }

  private parseAnalysis(response: string) {
    const arvMatch = response.match(/ARV[:\s]+[\$]?([\d,]+)/i);
    const repairMatch = response.match(/Repair[:\s]+[\$]?([\d,]+)/i);
    const maoMatch = response.match(/MAO[:\s]+[\$]?([\d,]+)/i);
    const confidenceMatch = response.match(/Confidence[:\s]+(\d+)/i);

    return {
      arv: arvMatch ? parseFloat(arvMatch[1].replace(/,/g, '')) : null,
      repairEstimate: repairMatch
        ? parseFloat(repairMatch[1].replace(/,/g, ''))
        : null,
      mao: maoMatch ? parseFloat(maoMatch[1].replace(/,/g, '')) : null,
      confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) / 100 : 0.5,
      rationale: response,
      compsSummary: {},
    };
  }

  private estimateCost(tokensIn: number, tokensOut: number): number {
    const inputCostPer1k = 0.03;
    const outputCostPer1k = 0.06;
    return (tokensIn / 1000) * inputCostPer1k + (tokensOut / 1000) * outputCostPer1k;
  }

  private async getTodayCost(accountId?: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await prisma.aICostLog.findMany({
      where: {
        createdAt: { gte: today },
        ...(accountId ? { accountId } : {}),
      },
    });

    return logs.reduce((sum, log) => sum + log.cost, 0);
  }

  private async getControlPlane() {
    const cp = await prisma.controlPlane.findFirst();
    return (
      cp || {
        enabled: true,
        smsEnabled: true,
        emailEnabled: true,
        docusignEnabled: true,
        externalDataEnabled: true,
      }
    );
  }
}
