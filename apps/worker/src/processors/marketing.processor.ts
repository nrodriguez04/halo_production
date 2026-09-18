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
import { aiSpendSince } from '../ai-spend';
import { getControlPlane } from '../control-plane';
import { AI_MODEL, estimateAiCostUsd } from '../ai-model';
import {
  CostBlockedError,
  chatCompletion as chatCompletionViaApi,
} from '../internal-api.client';

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
  // Paid calls go through the api's /internal routes so the cost-control
  // preflight and ledger apply; no SDK client here by design.

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

      const controlPlane = await this.getControlPlane(tenantId);
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
            eventType: 'MARKETING_JOB_BLOCKED',
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

    const completion = await chatCompletionViaApi(deal.accountId, {
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a marketing expert creating real estate property flyers.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      dealId: deal.id,
    });

    const content = completion.content;
    const cost = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const material = await prisma.marketingMaterial.create({
      data: {
        dealId,
        type: 'flyer',
        content,
        metadata: {
          model: completion.model,
          tokensUsed: completion.tokensIn + completion.tokensOut,
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

    const completion = await chatCompletionViaApi(deal.accountId, {
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are a real estate marketing expert creating buyer blast emails.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      dealId: deal.id,
    });

    const content = completion.content;
    const cost = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
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
          model: completion.model,
          tokensUsed: completion.tokensIn + completion.tokensOut,
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


  private async getTodayCost(accountId?: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return aiSpendSince(today, accountId);
  }

  private async getControlPlane(tenantId: string) {
    return getControlPlane(tenantId);
  }
}
