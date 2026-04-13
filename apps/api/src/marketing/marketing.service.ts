import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobRunEntityType,
  JobRunKind,
  JobRunStatus,
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PolicyViolationError,
  assertPolicy,
} from '@halo/shared';
import { QueueService } from '../queues/queue.service';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class MarketingService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private timelineService: TimelineService,
  ) {}

  async generateFlyer(accountId: string, actorId: string | null, dealId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, accountId } });
    if (!deal) {
      throw new NotFoundException(`Deal with ID ${dealId} not found`);
    }

    const controlPlane = await this.getControlPlane();
    const todayCost = await this.getTodayCost(accountId);
    const globalTodayCost = await this.getTodayCost();
    const dailyCap = parseFloat(process.env.OPENAI_DAILY_COST_CAP || '2.0');
    try {
      assertPolicy({
        tenantId: accountId,
        actorId,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'marketing.generate_flyer_draft',
        channel: 'marketing_flyer',
        dealId,
        dailySpendUsd: todayCost,
        dailyCapUsd: dailyCap,
        perTenantCapUsd: dailyCap,
        globalDailySpendUsd: globalTodayCost,
        globalDailyCapUsd: dailyCap,
        sideEffectsEnabled: controlPlane.enabled,
        aiEnabled: controlPlane.enabled && controlPlane.externalDataEnabled,
      });

      const run = await this.prisma.jobRun.create({
        data: {
          tenantId: accountId,
          kind: JobRunKind.GENERATE_FLYER_DRAFT,
          entityType: JobRunEntityType.DEAL,
          entityId: dealId,
          status: JobRunStatus.QUEUED,
          actorId: actorId || null,
        },
      });

      await this.queueService.enqueueMarketing({
        jobRunId: run.id,
        tenantId: accountId,
        dealId,
        type: 'GENERATE_FLYER_DRAFT',
        actorId,
      });

      await this.timelineService.appendEvent({
        tenantId: accountId,
        entityType: TimelineEntityType.JOB,
        entityId: run.id,
        eventType: 'MARKETING_FLYER_ENQUEUED',
        payload: { dealId },
        actorId,
        actorType: TimelineActorType.user,
      });

      return { jobId: run.id, status: run.status };
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      throw error;
    }
  }

  async generateBuyerBlast(
    accountId: string,
    actorId: string | null,
    dealId: string,
    buyerIds: string[],
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
    });
    if (!deal) {
      throw new NotFoundException(`Deal with ID ${dealId} not found`);
    }

    const controlPlane = await this.getControlPlane();
    const todayCost = await this.getTodayCost(accountId);
    const globalTodayCost = await this.getTodayCost();
    const dailyCap = parseFloat(process.env.OPENAI_DAILY_COST_CAP || '2.0');

    try {
      assertPolicy({
        tenantId: accountId,
        actorId,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'marketing.generate_buyer_blast_draft',
        channel: 'buyer_blast',
        dealId,
        dailySpendUsd: todayCost,
        dailyCapUsd: dailyCap,
        perTenantCapUsd: dailyCap,
        globalDailySpendUsd: globalTodayCost,
        globalDailyCapUsd: dailyCap,
        sideEffectsEnabled: controlPlane.enabled,
        aiEnabled: controlPlane.enabled && controlPlane.externalDataEnabled,
      });

      const run = await this.prisma.jobRun.create({
        data: {
          tenantId: accountId,
          kind: JobRunKind.GENERATE_BUYER_BLAST_DRAFT,
          entityType: JobRunEntityType.DEAL,
          entityId: dealId,
          status: JobRunStatus.QUEUED,
          actorId: actorId || null,
        },
      });

      await this.queueService.enqueueMarketing({
        jobRunId: run.id,
        tenantId: accountId,
        dealId,
        type: 'GENERATE_BUYER_BLAST_DRAFT',
        buyerIds,
        actorId,
      });

      await this.timelineService.appendEvent({
        tenantId: accountId,
        entityType: TimelineEntityType.JOB,
        entityId: run.id,
        eventType: 'MARKETING_BUYER_BLAST_ENQUEUED',
        payload: { dealId, buyerIds },
        actorId,
        actorType: TimelineActorType.user,
      });

      return { jobId: run.id, status: run.status };
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      throw error;
    }
  }

  async getLastFlyerDraft(accountId: string, dealId: string) {
    return this.prisma.marketingMaterial.findFirst({
      where: {
        dealId,
        deal: { accountId },
        type: 'flyer',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getLastBuyerBlastDraft(accountId: string, dealId: string) {
    return this.prisma.marketingMaterial.findFirst({
      where: {
        dealId,
        deal: { accountId },
        type: 'buyer_blast',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateVideoScript(accountId: string, userId: string, dealId: string) {
    const jobRun = await this.prisma.jobRun.create({
      data: {
        tenantId: accountId,
        kind: 'GENERATE_FLYER_DRAFT',
        entityType: 'DEAL',
        entityId: dealId,
        actorId: userId,
        status: 'QUEUED',
      },
    });

    await this.queueService.enqueueMarketing({
      type: 'GENERATE_VIDEO_SCRIPT',
      jobRunId: jobRun.id,
      tenantId: accountId,
      dealId,
      actorId: userId,
    });

    return { jobId: jobRun.id };
  }

  private async getTodayCost(accountId?: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logs = await this.prisma.aICostLog.findMany({
      where: {
        createdAt: { gte: today },
        ...(accountId ? { accountId } : {}),
      },
    });

    return logs.reduce((sum, log) => sum + log.cost, 0);
  }

  private async getControlPlane() {
    const cp = await this.prisma.controlPlane.findFirst();
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


