import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobRunKind,
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import {
  PolicyViolationError,
  assertPolicy,
  evaluatePolicy,
} from '@halo/shared';
import { AgentOrchestrationService } from '../agent/agent-orchestration.service';
import { TimelineService } from '../timeline/timeline.service';
import { aiSpendSince, startOfToday } from '../cost-control/ai-spend';

@Injectable()
export class UnderwritingService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private controlPlaneService: ControlPlaneService,
    private agents: AgentOrchestrationService,
  ) {}

  async analyze(accountId: string, actorId: string | null, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
    });
    if (!deal) {
      throw new NotFoundException(`Deal with ID ${dealId} not found`);
    }

    const controlPlane = await this.getControlPlane(accountId);
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
        aiEnabled: controlPlane.enabled && controlPlane.aiEnabled,
      });

      // On demand the Underwriter is the same agent the stage triggers run
      // (design doc s3.2); the run shows up on /admin/agents.
      const queued = await this.agents.enqueue({
        agent: 'deal_underwriter',
        accountId,
        entityType: 'deal',
        entityId: dealId,
        trigger: 'manual',
        triggerEventId: `manual:${Date.now()}`,
        actorId,
      });

      await this.timelineService.appendEvent({
        tenantId: accountId,
        entityType: TimelineEntityType.DEAL,
        entityId: dealId,
        eventType: 'UNDERWRITE_ENQUEUED',
        payload: {
          dealId,
          agent: 'deal_underwriter',
          queued,
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

      return {
        queued,
        status: queued ? 'QUEUED' : 'DISABLED',
        agent: 'deal_underwriter',
      };
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

  /**
   * The newest numbers for the deal: the Underwriter's row in
   * underwriting_results (legacy results live there too) or, when it is
   * newer, the last successful legacy job run. Flattened for the deal page.
   */
  async getResult(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
    });
    if (!deal) {
      throw new NotFoundException(
        `No underwriting result found for deal ${dealId}`,
      );
    }

    const [row, lastRun] = await Promise.all([
      this.prisma.underwritingResult.findUnique({
        where: { dealId },
        include: { deal: true, property: true },
      }),
      this.prisma.jobRun.findFirst({
        where: {
          tenantId: accountId,
          kind: JobRunKind.UNDERWRITE_DEAL,
          entityId: dealId,
          status: 'SUCCEEDED',
        },
        orderBy: { updatedAt: 'desc' },
      }),
    ]);

    const fromRun = (lastRun?.resultJson ?? null) as Record<
      string,
      unknown
    > | null;
    if (
      lastRun &&
      fromRun &&
      (!row || !row.updatedAt || lastRun.updatedAt > row.updatedAt)
    ) {
      return {
        source: 'job_run',
        jobId: lastRun.id,
        result: fromRun,
        arv: fromRun.arv ?? null,
        repairEstimate: fromRun.repairEstimate ?? null,
        mao: fromRun.mao ?? null,
        confidence: fromRun.confidence ?? null,
        summary: fromRun.rationale ?? null,
        updatedAt: lastRun.updatedAt,
      };
    }
    if (!row) {
      throw new NotFoundException(
        `No underwriting result found for deal ${dealId}`,
      );
    }
    const meta = (row.evaluationMetadata ?? {}) as Record<string, unknown>;
    return {
      source: meta.agent ? 'agent' : 'legacy',
      result: row,
      arv: row.arv,
      repairEstimate: row.repairEstimate,
      mao: row.mao,
      confidence: row.confidence,
      summary: row.rationale,
      offerRange: meta.offerRange ?? null,
      stale: meta.stale === true,
      automationRunId: meta.automationRunId ?? null,
      updatedAt: row.updatedAt,
    };
  }

  private async getTodayCost(accountId?: string): Promise<number> {
    return aiSpendSince(this.prisma, startOfToday(), accountId);
  }

  /**
   * Delegates to ControlPlaneService: switches are per-tenant and a missing
   * row is provisioned at documented defaults. The previous inline
   * `cp || { enabled: true, ... }` fallback meant an unscoped lookup that
   * returned nothing was silently treated as "everything enabled".
   */
  private async getControlPlane(accountId: string) {
    return this.controlPlaneService.getStatus(accountId);
  }
}
