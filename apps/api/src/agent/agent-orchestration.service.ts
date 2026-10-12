import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AutomationRunStatus,
  AutomationTriggerType,
  Prisma,
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import {
  AGENT_NAMES,
  agentWorkflow,
  aiProviderForModel,
  type AgentAction,
  type AgentAutonomy,
  type AgentDecision,
  type AgentJobPayload,
  type AgentName,
  type AgentRunOutcome,
  type AgentTrigger,
  type DealCreate,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AutomationService } from '../automation/automation.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { DealsService } from '../deals/deals.service';
import { LeadLifecycleService } from '../lead-lifecycle/lead-lifecycle.service';
import { QueueService } from '../queues/queue.service';
import { TimelineService } from '../timeline/timeline.service';
import { AgentService } from './agent.service';

const TRIGGER_TYPE: Record<AgentTrigger, AutomationTriggerType> = {
  lifecycle: AutomationTriggerType.API,
  inbound: AutomationTriggerType.INBOUND_WEBHOOK,
  sweep: AutomationTriggerType.SCHEDULED,
  manual: AutomationTriggerType.MANUAL,
};

export interface OpenRunInput {
  agent: AgentName;
  entityType: AgentJobPayload['entityType'];
  entityId: string;
  trigger: AgentTrigger;
  triggerEventId?: string;
  actorId?: string | null;
}

export interface DecisionReport {
  status: AgentRunOutcome;
  decision?: AgentDecision;
  costUsd?: number;
  error?: string;
}

interface AppliedAction {
  action: AgentAction;
  result: 'applied' | 'pending' | 'skipped' | 'failed';
  detail?: string;
}

type GatedAction = Extract<AgentAction, { gated: boolean }>;

const DEFAULT_SWEEP_STALE_DAYS = 7;

/**
 * The api side of the agent frame: enqueue runs, open the ledger row before
 * the worker does any work, record the worker's decision, and apply it
 * within the tenant's autonomy tier. Gated actions wait for a person and
 * are applied by `approve`. Every write goes through the existing services
 * (lifecycle, deals, drafts), so the agents never bypass a state machine.
 */
@Injectable()
export class AgentOrchestrationService {
  private readonly logger = new Logger(AgentOrchestrationService.name);

  constructor(
    private prisma: PrismaService,
    private automation: AutomationService,
    private controlPlane: ControlPlaneService,
    private deals: DealsService,
    private lifecycle: LeadLifecycleService,
    private queues: QueueService,
    private timeline: TimelineService,
    private agentService: AgentService,
  ) {}

  /** Queue an agent for an entity. Returns false when the control plane is off. */
  async enqueue(payload: AgentJobPayload): Promise<boolean> {
    if (!(await this.controlPlane.isEnabled(payload.accountId))) return false;
    await this.queues.enqueueAgent(payload);
    return true;
  }

  async openRun(accountId: string, input: OpenRunInput) {
    const run = await this.automation.createRun({
      tenantId: accountId,
      source: 'agent',
      agentName: input.agent,
      workflowName: agentWorkflow(input.agent),
      entityType: input.entityType,
      entityId: input.entityId,
      triggerType: TRIGGER_TYPE[input.trigger],
      inputJson: {
        trigger: input.trigger,
        triggerEventId: input.triggerEventId ?? null,
        actorId: input.actorId ?? null,
      },
      approvalRequired: false,
    });
    await this.automation.startRun(run.id, accountId);
    return { id: run.id };
  }

  /**
   * The worker reports what the agent decided. Autonomous actions apply now
   * when the tenant allows it; gated ones are stored as pending and the run
   * waits for approval.
   */
  async recordDecision(
    accountId: string,
    runId: string,
    report: DecisionReport,
  ) {
    const run = await this.ownedRun(accountId, runId);

    if (report.status === 'FAILED') {
      return this.automation.failRun(runId, accountId, {
        error: report.error ?? 'agent failed',
        decision: report.decision ?? null,
      });
    }
    if (report.status === 'CANCELLED') {
      await this.prisma.automationRun.update({
        where: { id: runId },
        data: {
          status: AutomationRunStatus.CANCELLED,
          completedAt: new Date(),
          decisionJson: (report.decision ?? {
            summary: 'cancelled',
          }) as unknown as Prisma.InputJsonObject,
        },
      });
      return this.automation.getRun(runId, accountId);
    }
    if (!report.decision) {
      throw new BadRequestException('A decision is required to complete a run');
    }

    const autonomy = await this.autonomyOf(accountId);
    const outcomes = await this.applyAutonomous(
      accountId,
      run,
      report.decision,
      autonomy,
    );
    const pending = outcomes.filter((o) => o.result === 'pending');
    const model = report.decision.model;
    const decisionJson = {
      ...report.decision,
      autonomy,
      outcomes,
    } as unknown as Prisma.InputJsonObject;
    const common = {
      decisionJson,
      modelProvider: model ? aiProviderForModel(model) : null,
      modelName: model,
      promptVersion: report.decision.promptVersion,
      aiCostUsd: report.costUsd ?? 0,
    };

    if (pending.length > 0) {
      await this.prisma.automationRun.update({
        where: { id: runId },
        data: {
          ...common,
          status: AutomationRunStatus.AWAITING_APPROVAL,
          approvalRequired: true,
          outputJson: {
            recommendation: report.decision.recommendation,
            summary: report.decision.summary,
            pendingActions: pending.length,
          },
        },
      });
      return this.automation.getRun(runId, accountId);
    }

    await this.prisma.automationRun.update({
      where: { id: runId },
      data: common,
    });
    return this.automation.completeRun(runId, accountId, {
      outputJson: {
        recommendation: report.decision.recommendation,
        summary: report.decision.summary,
        applied: outcomes.filter((o) => o.result === 'applied').length,
      },
      aiCostUsd: report.costUsd ?? 0,
    });
  }

  /** A person accepts the recommendation: the gated actions happen now. */
  async approve(accountId: string, runId: string, userId: string) {
    const run = await this.ownedRun(accountId, runId);
    if (run.status !== AutomationRunStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        `Run is ${run.status}, not awaiting approval`,
      );
    }
    const decision = run.decisionJson as unknown as
      | (AgentDecision & { outcomes?: AppliedAction[] })
      | null;
    if (!decision?.actions) {
      throw new BadRequestException('Run has no decision to apply');
    }
    const pending = (decision.outcomes ?? [])
      .filter((o) => o.result === 'pending')
      .map((o) => o.action as GatedAction);

    const applied: AppliedAction[] = [];
    for (const action of pending) {
      applied.push(
        await this.applyGated(accountId, run, decision.agent, action, userId),
      );
    }

    await this.automation.approveRun(runId, accountId, userId);
    const outcomes = [
      ...(decision.outcomes ?? []).filter((o) => o.result !== 'pending'),
      ...applied,
    ];
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        decisionJson: {
          ...decision,
          outcomes,
          approval: { by: userId, at: new Date().toISOString() },
        } as unknown as Prisma.InputJsonObject,
      },
    });
    return this.automation.completeRun(runId, accountId, {
      outputJson: {
        recommendation: decision.recommendation,
        summary: decision.summary,
        applied: outcomes.filter((o) => o.result === 'applied').length,
        messageIds: applied
          .map((o) => o.detail)
          .filter((d): d is string => !!d && d.startsWith('message:'))
          .map((d) => d.slice('message:'.length)),
      },
    });
  }

  /** A person declines: nothing changes on the lead; the run is closed as cancelled. */
  async reject(
    accountId: string,
    runId: string,
    userId: string,
    reason?: string,
  ) {
    const run = await this.ownedRun(accountId, runId);
    if (run.status !== AutomationRunStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        `Run is ${run.status}, not awaiting approval`,
      );
    }
    const decision = (run.decisionJson ?? {}) as Record<string, unknown>;
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.CANCELLED,
        completedAt: new Date(),
        decisionJson: {
          ...decision,
          rejection: {
            by: userId,
            at: new Date().toISOString(),
            reason: reason ?? null,
          },
        } as unknown as Prisma.InputJsonObject,
      },
    });
    return this.automation.getRun(runId, accountId);
  }

  /** Agent runs with a label for the entity, newest first. */
  async listRuns(
    accountId: string,
    filter: { agent?: AgentName; status?: AutomationRunStatus; limit?: number },
  ) {
    const runs = await this.prisma.automationRun.findMany({
      where: {
        tenantId: accountId,
        source: 'agent',
        agentName: filter.agent ?? { in: [...AGENT_NAMES] },
        ...(filter.status ? { status: filter.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(filter.limit ?? 50, 200),
    });
    const leadIds = runs
      .filter((r) => r.entityType === 'lead' && r.entityId)
      .map((r) => r.entityId as string);
    const leads = leadIds.length
      ? await this.prisma.lead.findMany({
          where: { id: { in: leadIds }, accountId },
          select: {
            id: true,
            canonicalAddress: true,
            canonicalCity: true,
            canonicalState: true,
            status: true,
            score: true,
          },
        })
      : [];
    const labels = new Map(
      leads.map((l) => [
        l.id,
        {
          label: [l.canonicalAddress, l.canonicalCity, l.canonicalState]
            .filter(Boolean)
            .join(', '),
          status: l.status,
          score: l.score,
        },
      ]),
    );
    const dealIds = runs
      .filter((r) => r.entityType === 'deal' && r.entityId)
      .map((r) => r.entityId as string);
    const deals = dealIds.length
      ? await this.prisma.deal.findMany({
          where: { id: { in: dealIds }, accountId },
          select: {
            id: true,
            stage: true,
            property: { select: { address: true, city: true, state: true } },
          },
        })
      : [];
    for (const d of deals) {
      labels.set(d.id, {
        label: d.property
          ? [d.property.address, d.property.city, d.property.state]
              .filter(Boolean)
              .join(', ')
          : `Deal ${d.id}`,
        status: d.stage,
        score: null,
      });
    }
    return runs.map((r) => ({
      ...r,
      entity: r.entityId ? (labels.get(r.entityId) ?? null) : null,
    }));
  }

  /**
   * Nightly sweep (design doc s4): leads that have sat in `enriched` with no
   * deal for too long get another look. The job id carries the date, so the
   * same sweep never queues a lead twice.
   */
  async sweep(now = new Date(), staleDays = sweepStaleDays()): Promise<number> {
    const cutoff = new Date(now.getTime() - staleDays * 86_400_000);
    const stale = await this.prisma.lead.findMany({
      where: {
        status: 'enriched',
        updatedAt: { lte: cutoff },
        deals: { none: {} },
      },
      select: { id: true, accountId: true },
      take: 500,
    });
    const day = now.toISOString().slice(0, 10);
    let queued = 0;
    for (const lead of stale) {
      const ok = await this.enqueue({
        agent: 'lead_analyst',
        accountId: lead.accountId,
        entityType: 'lead',
        entityId: lead.id,
        trigger: 'sweep',
        triggerEventId: `sweep:${day}`,
      });
      if (ok) queued++;
    }
    return queued;
  }

  // ------------------------------------------------------------- internals

  private async ownedRun(accountId: string, runId: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: { id: runId, tenantId: accountId },
    });
    if (!run) throw new NotFoundException(`Automation run ${runId} not found`);
    return run;
  }

  private async autonomyOf(accountId: string): Promise<AgentAutonomy> {
    const status = await this.controlPlane.getStatus(accountId);
    return status.agentAutonomy === 'standard' ? 'standard' : 'draft_only';
  }

  private async applyAutonomous(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    decision: AgentDecision,
    autonomy: AgentAutonomy,
  ): Promise<AppliedAction[]> {
    const out: AppliedAction[] = [];
    const leadId = run.entityType === 'lead' ? run.entityId : null;
    const dealId = run.entityType === 'deal' ? run.entityId : null;
    for (const action of decision.actions) {
      try {
        switch (action.type) {
          case 'set_lead_score': {
            if (!leadId) throw new Error('no lead on this run');
            await this.prisma.lead.updateMany({
              where: { id: leadId, accountId },
              data: { score: action.score },
            });
            out.push({ action, result: 'applied' });
            break;
          }
          case 'append_note': {
            const noteEntity = leadId ?? dealId;
            if (!noteEntity) throw new Error('no lead or deal on this run');
            await this.timeline.appendEvent({
              tenantId: accountId,
              entityType: leadId
                ? TimelineEntityType.LEAD
                : TimelineEntityType.DEAL,
              entityId: noteEntity,
              eventType: 'AGENT_NOTE',
              payload: {
                note: action.note,
                agent: decision.agent,
                automationRunId: run.id,
                hardRule: decision.hardRule ?? null,
              },
              actorId: null,
              actorType: TimelineActorType.system,
            });
            out.push({ action, result: 'applied' });
            break;
          }
          case 'transition_lead': {
            if (action.gated || autonomy !== 'standard') {
              out.push({ action, result: 'pending' });
              break;
            }
            if (!leadId) throw new Error('no lead on this run');
            await this.lifecycle.transition({
              leadId,
              accountId,
              next: action.to,
              actorType: 'system',
              reason: action.reason,
              metadata: { agent: decision.agent, automationRunId: run.id },
            });
            out.push({ action, result: 'applied' });
            break;
          }
          case 'set_deal_economics': {
            if (!dealId) throw new Error('no deal on this run');
            out.push(
              await this.applyDealEconomics(
                accountId,
                run.id,
                dealId,
                action,
                decision,
              ),
            );
            break;
          }
          case 'draft_message':
            out.push({ action, result: 'pending' });
            break;
        }
      } catch (err) {
        out.push({ action, result: 'failed', detail: (err as Error).message });
      }
    }
    return out;
  }

  /**
   * Underwriter numbers (design doc s3.2): written to the deal only when
   * nobody edited it since the context was loaded, and recorded in
   * underwriting_results either way so the run stays auditable.
   */
  private async applyDealEconomics(
    accountId: string,
    runId: string,
    dealId: string,
    action: Extract<AgentAction, { type: 'set_deal_economics' }>,
    decision: AgentDecision,
  ): Promise<AppliedAction> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: { id: true, propertyId: true },
    });
    if (!deal) throw new Error('deal not found');
    const write = await this.prisma.deal.updateMany({
      where: {
        id: dealId,
        accountId,
        updatedAt: new Date(action.dealUpdatedAt),
      },
      data: {
        arv: action.arv,
        repairEstimate: action.repairEstimate,
        mao: action.mao,
      },
    });
    const stale = write.count === 0;
    const numbers = {
      arv: action.arv,
      repairEstimate: action.repairEstimate,
      mao: action.mao,
      confidence: action.confidence,
      rationale: action.rationale,
      compsSummary: action.compsSummary
        ? { summary: action.compsSummary }
        : Prisma.JsonNull,
      evaluationMetadata: {
        agent: decision.agent,
        automationRunId: runId,
        model: decision.model,
        promptVersion: decision.promptVersion,
        recommendation: decision.recommendation,
        offerRange: { low: action.offerLow, high: action.offerHigh },
        stale,
      },
    };
    await this.prisma.underwritingResult.upsert({
      where: { dealId },
      create: { dealId, propertyId: deal.propertyId ?? undefined, ...numbers },
      update: numbers,
    });
    return stale
      ? {
          action,
          result: 'skipped',
          detail:
            'deal was edited during the run; its numbers were kept and the result recorded as stale',
        }
      : { action, result: 'applied' };
  }

  private async applyGated(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    agent: AgentName,
    action: GatedAction,
    userId: string,
  ): Promise<AppliedAction> {
    const leadId = run.entityType === 'lead' ? run.entityId : null;
    try {
      if (action.type === 'transition_lead') {
        if (!leadId) throw new Error('no lead on this run');
        await this.lifecycle.transition({
          leadId,
          accountId,
          next: action.to,
          actorId: userId,
          actorType: 'user',
          reason: action.reason,
          metadata: { agent, automationRunId: run.id, approvedBy: userId },
        });
        return { action, result: 'applied' };
      }
      if (!leadId) throw new Error('no lead on this run');
      const lead = await this.prisma.lead.findFirst({
        where: { id: leadId, accountId },
        select: {
          id: true,
          canonicalPhoneHash: true,
          canonicalEmailHash: true,
          properties: { select: { id: true }, take: 1 },
        },
      });
      if (!lead) throw new Error('lead not found');
      const hasContact =
        action.channel === 'sms'
          ? !!lead.canonicalPhoneHash
          : !!lead.canonicalEmailHash;
      if (!hasContact) {
        return {
          action,
          result: 'skipped',
          detail: `lead has no ${action.channel === 'sms' ? 'phone' : 'email'} on file`,
        };
      }
      const deal = await this.dealFor(accountId, lead, userId);
      const draft = await this.agentService.draftMessage(
        deal.id,
        accountId,
        action.channel,
        action.recipientType,
        {
          content: action.content,
          subject: action.subject,
          agentName: agent,
          workflowName: agentWorkflow(agent),
          automationRunId: run.id,
        },
      );
      return {
        action,
        result: 'applied',
        detail: `message:${draft.message.id}`,
      };
    } catch (err) {
      return { action, result: 'failed', detail: (err as Error).message };
    }
  }

  /** The lead's open deal, or a new one so the drafts have a home. */
  private async dealFor(
    accountId: string,
    lead: { id: string; properties: Array<{ id: string }> },
    userId: string,
  ): Promise<{ id: string }> {
    const existing = await this.prisma.deal.findFirst({
      where: { accountId, leadId: lead.id, stage: { not: 'lost' } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existing) return existing;
    const created = await this.deals.create(
      {
        accountId,
        leadId: lead.id,
        propertyId: lead.properties[0]?.id,
        stage: 'new',
      } as DealCreate,
      userId,
    );
    this.logger.log(
      `Created deal ${created.id} for lead ${lead.id} on approval`,
    );
    return { id: created.id };
  }
}

function sweepStaleDays(): number {
  const n = Number(process.env.AGENT_SWEEP_STALE_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SWEEP_STALE_DAYS;
}
