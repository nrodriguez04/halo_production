import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  JobRunStatus,
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import * as crypto from 'crypto';
import { assertPolicy, prompts, renderPrompt } from '@halo/shared';
import { prisma } from '../prisma-client';
import { getControlPlane } from '../control-plane';
import { AI_MODEL, estimateAiCostUsd } from '../ai-model';
import {
  CostBlockedError,
  chatCompletion as chatCompletionViaApi,
} from '../internal-api.client';

@Processor('underwriting')
export class UnderwritingProcessor extends WorkerHost {
  // Paid calls go through the api's /internal routes so the cost-control
  // preflight and ledger apply; no SDK client here by design.

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

      const controlPlane = await this.getControlPlane(tenantId);
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

      const completion = await chatCompletionViaApi(tenantId, {
        model: AI_MODEL,
        messages: [
          { role: 'system', content: prompts.underwriting.system },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        dealId,
      });

      const response = completion.content;
      const analysis = this.parseAnalysis(response);
      const cost = estimateAiCostUsd(
        completion.model,
        completion.tokensIn,
        completion.tokensOut,
      );

      await prisma.aICostLog.create({
        data: {
          provider: 'openai',
          model: completion.model,
          tokensIn: completion.tokensIn,
          tokensOut: completion.tokensOut,
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
            model: completion.model,
            tokensUsed: completion.tokensIn + completion.tokensOut,
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
            model: completion.model,
            tokensUsed: completion.tokensIn + completion.tokensOut,
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
      // A spend cap is not a job failure. Retrying only burns queue
      // attempts against a budget that is still exhausted, so record the
      // block and finish; the job can be re-queued next budget period.
      if (error instanceof CostBlockedError) {
        await prisma.jobRun.update({
          where: { id: jobRunId },
          data: {
            status: JobRunStatus.FAILED,
            error: `Blocked by cost control: ${error.reason} (${error.provider})`,
          },
        });
        await prisma.timelineEvent.create({
          data: {
            tenantId,
            entityType: TimelineEntityType.JOB,
            entityId: jobRunId,
            eventType: 'UNDERWRITE_BLOCKED',
            payloadJson: { reason: error.reason, provider: error.provider },
            actorId: actorId || null,
            actorType: TimelineActorType.system,
          },
        });
        return { success: false, blocked: true, reason: error.reason };
      }

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

  private async getControlPlane(tenantId: string) {
    return getControlPlane(tenantId);
  }
}
