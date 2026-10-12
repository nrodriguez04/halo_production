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
import { OptOutService } from '../compliance/opt-out.service';
import { openCounterparty } from '../communications/message-counterparty';
import { CommunicationsService } from '../communications/communications.service';
import { openValue } from '../pii/contact-crypto';

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
const DEFAULT_FOLLOWUP_DAYS = 3;

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
    private optOut: OptOutService,
    private communications: CommunicationsService,
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
        messageIds: applied.flatMap((o) => messageIdsFromDetail(o.detail)),
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
  async sweepStaleLeads(
    now = new Date(),
    staleDays = sweepStaleDays(),
  ): Promise<number> {
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

  /** The nightly sweep: stale leads for the Analyst, quiet deals for the Drafter. */
  async sweep(now = new Date(), staleDays = sweepStaleDays()): Promise<number> {
    const leads = await this.sweepStaleLeads(now, staleDays);
    const followUps = await this.sweepFollowUps(now);
    return leads + followUps;
  }

  /**
   * Design doc s3.3: a deal in contacted / negotiating whose last message
   * is ours, sent at least AGENT_FOLLOWUP_DAYS ago with nothing waiting in
   * the queue, gets a follow-up drafted. An inbound last message was already
   * answered by the inbound trigger; a draft or pending message means a
   * person has not acted yet.
   */
  async sweepFollowUps(
    now = new Date(),
    days = followUpDays(),
  ): Promise<number> {
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const day = now.toISOString().slice(0, 10);
    const deals = await this.prisma.deal.findMany({
      where: {
        stage: { in: ['contacted', 'negotiating'] },
        leadId: { not: null },
      },
      select: { id: true, accountId: true },
      take: 500,
    });
    let queued = 0;
    for (const deal of deals) {
      const last = await this.prisma.message.findFirst({
        where: {
          accountId: deal.accountId,
          dealId: deal.id,
          status: { not: 'failed' },
        },
        orderBy: { createdAt: 'desc' },
        select: { direction: true, status: true, createdAt: true },
      });
      if (!last || last.direction !== 'outbound') continue;
      if (['draft', 'pending_approval', 'approved'].includes(last.status))
        continue;
      if (last.createdAt > cutoff) continue;
      const ok = await this.enqueue({
        agent: 'outreach_drafter',
        accountId: deal.accountId,
        entityType: 'deal',
        entityId: deal.id,
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
          case 'classify_inbound': {
            out.push(await this.classifyInbound(accountId, run, action));
            break;
          }
          case 'record_opt_out': {
            if (action.gated) {
              out.push({ action, result: 'pending' });
              break;
            }
            out.push(await this.recordOptOut(accountId, run, decision, action));
            break;
          }
          case 'flag_contact': {
            out.push(await this.flagContact(accountId, run, action));
            break;
          }
          case 'rank_buyers': {
            out.push(await this.rankBuyers(accountId, run, decision, action));
            break;
          }
          case 'queue_buyer_blast':
          case 'transition_deal':
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
    const dealId = run.entityType === 'deal' ? run.entityId : null;
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
      if (action.type === 'transition_deal') {
        if (!dealId) throw new Error('no deal on this run');
        await this.deals.updateStage(
          dealId,
          accountId,
          action.to,
          userId,
          TimelineActorType.user,
        );
        return { action, result: 'applied' };
      }
      if (action.type === 'record_opt_out') {
        return this.recordOptOut(accountId, run, { agent }, action);
      }
      if (action.type === 'queue_buyer_blast') {
        return this.createBuyerBlastDrafts(
          accountId,
          run,
          agent,
          action,
          userId,
        );
      }
      const target = await this.draftTarget(accountId, run, userId);
      const hasContact =
        action.channel === 'sms'
          ? !!target.lead.canonicalPhoneHash
          : !!target.lead.canonicalEmailHash;
      if (!hasContact) {
        return {
          action,
          result: 'skipped',
          detail: `lead has no ${action.channel === 'sms' ? 'phone' : 'email'} on file`,
        };
      }
      const draft = await this.agentService.draftMessage(
        target.dealId,
        accountId,
        action.channel,
        action.recipientType,
        {
          content: action.content,
          subject: action.subject,
          agentName: agent,
          workflowName: agentWorkflow(agent),
          automationRunId: run.id,
          metadata: action.inReplyToMessageId
            ? { inReplyToMessageId: action.inReplyToMessageId }
            : undefined,
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

  /**
   * Where a draft lives: the run's deal and its seller, or, for a lead run,
   * the lead's open deal (created on approval when there is none).
   */
  private async draftTarget(
    accountId: string,
    run: { entityType: string | null; entityId: string | null },
    userId: string,
  ): Promise<{
    dealId: string;
    lead: {
      canonicalPhoneHash: string | null;
      canonicalEmailHash: string | null;
    };
  }> {
    if (run.entityType === 'deal' && run.entityId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: run.entityId, accountId },
        select: {
          id: true,
          lead: {
            select: { canonicalPhoneHash: true, canonicalEmailHash: true },
          },
        },
      });
      if (!deal) throw new Error('deal not found');
      if (!deal.lead) throw new Error('deal has no seller lead');
      return { dealId: deal.id, lead: deal.lead };
    }
    if (run.entityType !== 'lead' || !run.entityId) {
      throw new Error('no lead or deal on this run');
    }
    const lead = await this.prisma.lead.findFirst({
      where: { id: run.entityId, accountId },
      select: {
        id: true,
        canonicalPhoneHash: true,
        canonicalEmailHash: true,
        properties: { select: { id: true }, take: 1 },
      },
    });
    if (!lead) throw new Error('lead not found');
    const deal = await this.dealFor(accountId, lead, userId);
    return { dealId: deal.id, lead };
  }

  /** The reply's intent, on the message and on the timeline of the deal (or lead). */
  private async classifyInbound(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    action: Extract<AgentAction, { type: 'classify_inbound' }>,
  ): Promise<AppliedAction> {
    const message = await this.prisma.message.findFirst({
      where: { id: action.messageId, accountId, direction: 'inbound' },
      select: { id: true, metadata: true, leadId: true, dealId: true },
    });
    if (!message) throw new Error('inbound message not found');
    await this.prisma.message.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...((message.metadata as Record<string, unknown>) ?? {}),
          intent: action.intent,
          intentConfidence: action.confidence,
          intentMethod: action.method,
          classifiedByRunId: run.id,
        } as Prisma.InputJsonObject,
      },
    });
    const entityId = run.entityId ?? message.dealId ?? message.leadId;
    if (entityId) {
      await this.timeline.appendEvent({
        tenantId: accountId,
        entityType:
          run.entityType === 'lead'
            ? TimelineEntityType.LEAD
            : TimelineEntityType.DEAL,
        entityId,
        eventType: 'INBOUND_CLASSIFIED',
        payload: {
          messageId: message.id,
          intent: action.intent,
          confidence: action.confidence,
          method: action.method,
          automationRunId: run.id,
        },
        actorId: null,
        actorType: TimelineActorType.system,
      });
    }
    return { action, result: 'applied' };
  }

  /**
   * An opt-out goes through the compliance service (DNC entry, consents
   * revoked, audit row), with the contact revealed api-side from the
   * message's sealed counterparty. The worker never sees the number.
   */
  private async recordOptOut(
    accountId: string,
    run: { id: string },
    decision: { agent: AgentName },
    action: Extract<AgentAction, { type: 'record_opt_out' }>,
  ): Promise<AppliedAction> {
    const message = await this.prisma.message.findFirst({
      where: { id: action.messageId, accountId, direction: 'inbound' },
      select: { id: true, channel: true, counterpartyEnc: true },
    });
    if (!message) throw new Error('inbound message not found');
    const contact = openCounterparty(message);
    if (!contact) throw new Error('inbound message has no sealed sender');
    const source = `agent:${decision.agent}:${run.id}`;
    const recorded =
      message.channel === 'email'
        ? await this.optOut.recordEmailOptOut({
            accountId,
            email: contact,
            source,
            reason: action.reason,
          })
        : await this.optOut.recordPhoneOptOut({
            accountIds: [accountId],
            phone: contact,
            source,
            reason: action.reason,
          });
    return {
      action,
      result: 'applied',
      detail: `opt-out recorded for ${recorded.accountIds.length} scope(s), ${recorded.consentsRevoked} consent(s) revoked`,
    };
  }

  /** A contact that does not reach the owner: tag the lead for a new skip trace. */
  private async flagContact(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    action: Extract<AgentAction, { type: 'flag_contact' }>,
  ): Promise<AppliedAction> {
    const leadId =
      run.entityType === 'lead'
        ? run.entityId
        : run.entityType === 'deal' && run.entityId
          ? (
              await this.prisma.deal.findFirst({
                where: { id: run.entityId, accountId },
                select: { leadId: true },
              })
            )?.leadId
          : null;
    if (!leadId) throw new Error('no lead to flag');
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, accountId },
      select: { id: true, tags: true },
    });
    if (!lead) throw new Error('lead not found');
    const tag = `contact:${action.reason}`;
    if (!lead.tags.includes(tag)) {
      await this.prisma.lead.updateMany({
        where: { id: leadId, accountId },
        data: { tags: [...lead.tags, tag] },
      });
    }
    await this.timeline.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.LEAD,
      entityId: leadId,
      eventType: 'CONTACT_FLAGGED',
      payload: {
        reason: action.reason,
        note: action.note,
        automationRunId: run.id,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });
    return { action, result: 'applied', detail: `tagged ${tag}` };
  }

  /** The Matcher's ranking: a shortlist row on the deal's marketing materials and a timeline event. */
  private async rankBuyers(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    decision: { agent: AgentName },
    action: Extract<AgentAction, { type: 'rank_buyers' }>,
  ): Promise<AppliedAction> {
    if (run.entityType !== 'deal' || !run.entityId) {
      throw new Error('no deal on this run');
    }
    const deal = await this.prisma.deal.findFirst({
      where: { id: run.entityId, accountId },
      select: { id: true },
    });
    if (!deal) throw new Error('deal not found');
    await this.prisma.marketingMaterial.create({
      data: {
        dealId: deal.id,
        type: 'buyer_shortlist',
        content:
          action.shortlist
            .map((b) => `${b.rank}. ${b.name} (${b.fit}): ${b.reason}`)
            .join('\n') || null,
        metadata: {
          shortlist: action.shortlist,
          consideredCount: action.consideredCount,
          agent: decision.agent,
          automationRunId: run.id,
        } as unknown as Prisma.InputJsonObject,
      },
    });
    await this.timeline.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: deal.id,
      eventType: 'BUYERS_RANKED',
      payload: {
        count: action.shortlist.length,
        considered: action.consideredCount,
        buyerIds: action.shortlist.map((b) => b.buyerId),
        automationRunId: run.id,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });
    return {
      action,
      result: 'applied',
      detail: `${action.shortlist.length} buyer(s) shortlisted of ${action.consideredCount}`,
    };
  }

  /**
   * The approved blast: one email draft per shortlisted buyer, created
   * through the communications service so DNC, consent and quiet hours are
   * checked per recipient and each lands in the approval queue. The buyer's
   * address is revealed here, api-side, and sealed on the message row.
   */
  private async createBuyerBlastDrafts(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    agent: AgentName,
    action: Extract<AgentAction, { type: 'queue_buyer_blast' }>,
    userId: string,
  ): Promise<AppliedAction> {
    if (run.entityType !== 'deal' || !run.entityId) {
      throw new Error('no deal on this run');
    }
    const dealId = run.entityId;
    const buyers = await this.prisma.buyer.findMany({
      where: { id: { in: action.buyerIds }, accountId },
      select: { id: true, name: true, emailEnc: true },
    });
    const messageIds: string[] = [];
    const skipped: string[] = [];
    for (const buyer of buyers) {
      const email = buyer.emailEnc ? openValue(buyer.emailEnc) : null;
      if (!email) {
        skipped.push(`${buyer.name}: no email`);
        continue;
      }
      try {
        const message = await this.communications.create({
          accountId,
          dealId,
          channel: 'email',
          direction: 'outbound',
          content: action.body,
          metadata: {
            email,
            recipientType: 'buyer',
            buyerId: buyer.id,
            buyerName: buyer.name,
            type: 'buyer_blast',
            subject: action.subject,
            agentName: agent,
            automationRunId: run.id,
            approvedRunBy: userId,
          },
          source: 'agent',
          agentName: agent,
          automationRunId: run.id,
        } as Parameters<CommunicationsService['create']>[0]);
        messageIds.push(message.id);
      } catch (err) {
        skipped.push(`${buyer.name}: ${(err as Error).message}`);
      }
    }
    await this.prisma.marketingMaterial.create({
      data: {
        dealId,
        type: 'buyer_blast',
        content: `${action.subject}\n\n${action.body}`,
        metadata: {
          buyerIds: action.buyerIds,
          messageIds,
          subject: action.subject,
          agent,
          automationRunId: run.id,
          skipped,
        } as unknown as Prisma.InputJsonObject,
      },
    });
    if (messageIds.length === 0) {
      return {
        action,
        result: 'failed',
        detail: `no draft could be created: ${skipped.join('; ') || 'no buyers found'}`,
      };
    }
    return {
      action,
      result: 'applied',
      detail:
        `messages:${messageIds.join(',')}` +
        (skipped.length ? `; skipped ${skipped.join('; ')}` : ''),
    };
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

function followUpDays(): number {
  const n = Number(process.env.AGENT_FOLLOWUP_DAYS);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_FOLLOWUP_DAYS;
}

/** Message ids recorded on an applied outcome: `message:<id>` or `messages:<id>,<id>`. */
function messageIdsFromDetail(detail?: string): string[] {
  if (!detail) return [];
  if (detail.startsWith('message:')) return [detail.slice('message:'.length)];
  if (detail.startsWith('messages:')) {
    return detail
      .slice('messages:'.length)
      .split(';')[0]
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}
