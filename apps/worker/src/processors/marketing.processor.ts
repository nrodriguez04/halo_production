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

type MarketingPayload = {
  jobRunId: string;
  tenantId: string;
  dealId: string;
  type: 'GENERATE_FLYER_DRAFT' | 'GENERATE_BUYER_BLAST_DRAFT';
  buyerIds?: string[];
  actorId?: string | null;
};

@Processor('marketing')
export class MarketingProcessor extends WorkerHost {
  private _openai: OpenAI | null = null;

  private get openai(): OpenAI {
    if (!this._openai) {
      this._openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY || 'sk-placeholder',
      });
    }
    return this._openai;
  }

  async process(job: Job<MarketingPayload>) {
    const { jobRunId, tenantId, dealId, type, buyerIds = [], actorId } = job.data;

    await prisma.jobRun.update({
      where: { id: jobRunId },
      data: { status: JobRunStatus.RUNNING, attempts: { increment: 1 } },
    });

    try {
      const deal = await prisma.deal.findFirst({
        where: { id: dealId, accountId: tenantId },
        include: { property: true, underwritingResult: true },
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
        requestedAction:
          type === 'GENERATE_FLYER_DRAFT'
            ? 'marketing.generate_flyer_draft'
            : 'marketing.generate_buyer_blast_draft',
        channel:
          type === 'GENERATE_FLYER_DRAFT' ? 'marketing_flyer' : 'buyer_blast',
        dealId,
        dailySpendUsd: todayCost,
        dailyCapUsd: dailyCap,
        perTenantCapUsd: dailyCap,
        globalDailySpendUsd: globalTodayCost,
        globalDailyCapUsd: dailyCap,
        sideEffectsEnabled: controlPlane.enabled,
        aiEnabled: controlPlane.enabled && controlPlane.externalDataEnabled,
      });

      const result =
        type === 'GENERATE_FLYER_DRAFT'
          ? await this.generateFlyer(dealId, deal)
          : await this.generateBuyerBlast(dealId, deal, buyerIds);

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
          eventType:
            type === 'GENERATE_FLYER_DRAFT'
              ? 'MARKETING_FLYER_COMPLETED'
              : 'MARKETING_BUYER_BLAST_COMPLETED',
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
          eventType: 'MARKETING_JOB_FAILED',
          payloadJson: { dealId, type, error: (error as Error).message },
          actorId: actorId || null,
          actorType: TimelineActorType.system,
        },
      });

      throw error;
    }
  }

  private async generateFlyer(dealId: string, deal: any) {
    const dealData = {
      address: deal.property?.address,
      city: deal.property?.city,
      state: deal.property?.state,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      offerAmount: deal.offerAmount,
    };

    const prompt = renderPrompt(prompts.marketing.flyer, {
      dealData: JSON.stringify(dealData, null, 2),
    });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a marketing expert creating real estate property flyers.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || '';
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
        accountId: deal.accountId,
      },
    });

    const material = await prisma.marketingMaterial.create({
      data: {
        dealId,
        type: 'flyer',
        content,
        metadata: {
          model: 'gpt-4',
          tokensUsed: completion.usage?.total_tokens,
          cost,
        },
      },
    });

    return {
      marketingMaterialId: material.id,
      type: material.type,
      content: material.content,
    };
  }

  private async generateBuyerBlast(
    dealId: string,
    deal: any,
    buyerIds: string[],
  ) {
    const buyers = await prisma.buyer.findMany({
      where: {
        accountId: deal.accountId,
        id: { in: buyerIds },
      },
    });

    const prompt = renderPrompt(prompts.marketing.buyer_blast, {
      dealData: JSON.stringify(
        {
          address: deal.property?.address,
          arv: deal.arv,
          repairEstimate: deal.repairEstimate,
          offerAmount: deal.offerAmount,
        },
        null,
        2,
      ),
      buyerPreferences: JSON.stringify(
        buyers.map((b) => b.preferences),
        null,
        2,
      ),
    });

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'You are a real estate marketing expert creating buyer blast emails.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
    });

    const content = completion.choices[0].message.content || '';
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
        accountId: deal.accountId,
      },
    });

    const message = await prisma.message.create({
      data: {
        accountId: deal.accountId,
        dealId,
        channel: 'email',
        direction: 'outbound',
        status: 'pending_approval',
        content,
        metadata: {
          type: 'buyer_blast',
          buyerIds,
          model: 'gpt-4',
          tokensUsed: completion.usage?.total_tokens,
          cost,
        } as any,
      },
    });

    const material = await prisma.marketingMaterial.create({
      data: {
        dealId,
        type: 'buyer_blast',
        content,
        metadata: {
          buyerIds,
          messageId: message.id,
        },
      },
    });

    return {
      messageId: message.id,
      marketingMaterialId: material.id,
      content,
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
