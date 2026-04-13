import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobRunEntityType, JobRunKind, TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  PolicyViolationError,
  assertPolicy,
  evaluatePolicy,
} from '@halo/shared';
import { QueueService } from '../queues/queue.service';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class UnderwritingService {
  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private timelineService: TimelineService,
  ) {}

  async analyze(accountId: string, actorId: string | null, dealId: string) {
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
      const decisions = assertPolicy({
        tenantId: accountId,
        actorId,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'underwriting.enqueue',
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

      const run = await this.prisma.jobRun.create({
        data: {
          tenantId: accountId,
          kind: JobRunKind.UNDERWRITE_DEAL,
          entityType: JobRunEntityType.DEAL,
          entityId: dealId,
          status: 'QUEUED',
          actorId: actorId || null,
        },
      });

      await this.queueService.enqueueUnderwriting({
        jobRunId: run.id,
        tenantId: accountId,
        dealId,
        actorId,
      });

      await this.timelineService.appendEvent({
        tenantId: accountId,
        entityType: TimelineEntityType.JOB,
        entityId: run.id,
        eventType: 'UNDERWRITE_ENQUEUED',
        payload: {
          dealId,
          policy: evaluatePolicy({
            tenantId: accountId,
            actorId,
            actorType: 'user',
            now: new Date(),
            requestedAction: 'underwriting.enqueue',
            channel: 'ai_underwrite',
          }),
          decisionCount: decisions.length,
        },
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

  async getResult(accountId: string, dealId: string) {
    const lastRun = await this.prisma.jobRun.findFirst({
      where: {
        tenantId: accountId,
        kind: JobRunKind.UNDERWRITE_DEAL,
        entityId: dealId,
        status: 'SUCCEEDED',
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (lastRun?.resultJson) {
      return {
        source: 'job_run',
        jobId: lastRun.id,
        result: lastRun.resultJson,
      };
    }

    const legacy = await this.prisma.underwritingResult.findUnique({
      where: { dealId },
      include: {
        deal: true,
        property: true,
      },
    });

    if (!legacy) {
      throw new NotFoundException(`No underwriting result found for deal ${dealId}`);
    }

    return {
      source: 'legacy',
      result: legacy,
    };
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

