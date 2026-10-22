import {
  BadRequestException,
  ForbiddenException,
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
  assignmentFeeFor,
  underwriteDeal,
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
import { DisclosureGateService } from '../compliance/disclosure-gate.service';
import { LeadSkipTraceService } from '../skip-trace/lead-skip-trace.service';
import { thresholdFor } from '../cost-control/policy/lead-score-thresholds';
import { openValue } from '../pii/contact-crypto';
import { OffersService } from '../disposition/offers.service';
import { DispositionEligibilityService } from '../disposition/eligibility.service';

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
  /** What the agent saw and the model's raw reply, kept with the run. */
  replay?: { context?: unknown; reply?: unknown };
}

interface AppliedAction {
  action: AgentAction;
  result: 'applied' | 'pending' | 'skipped' | 'failed';
  detail?: string;
}

type GatedAction = Extract<AgentAction, { gated: boolean }>;

const DEFAULT_SWEEP_STALE_DAYS = 7;
const DEFAULT_FOLLOWUP_DAYS = 3;
/** Model replies are a few kB; anything longer is cut, never refused. */
const MAX_REPLAY_REPLY_CHARS = 20_000;

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
    private disclosure: DisclosureGateService,
    private skipTrace: LeadSkipTraceService,
    private offers: OffersService,
    private eligibility: DispositionEligibilityService,
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
    await this.storeReplay(accountId, runId, report.decision, report.replay);

    const autonomy = await this.autonomyOf(accountId);
    const outcomes = await this.applyAutonomous(
      accountId,
      run,
      report.decision,
      autonomy,
    );
    const pending = outcomes.filter((o) => o.result === 'pending');
    this.skipTraceAfterScore(accountId, run, report.decision);
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

  /**
   * Keeps what the agent saw and what the model answered, so the run can be
   * replayed exactly and a reviewed run can seed the golden set
   * (docs/agent-eval.md). Best effort: a replay that cannot be stored never
   * costs the decision.
   */
  private async storeReplay(
    accountId: string,
    runId: string,
    decision: AgentDecision,
    replay: DecisionReport['replay'],
  ) {
    const context = replay?.context;
    if (!context || typeof context !== 'object' || Array.isArray(context)) {
      return;
    }
    const data = {
      agent: decision.agent,
      promptVersion: decision.promptVersion ?? null,
      context: context as Prisma.InputJsonObject,
      reply:
        typeof replay.reply === 'string'
          ? replay.reply.slice(0, MAX_REPLAY_REPLY_CHARS)
          : null,
    };
    try {
      await this.prisma.agentRunReplay.upsert({
        where: { runId },
        create: { runId, tenantId: accountId, ...data },
        update: data,
      });
    } catch (err) {
      this.logger.warn(
        `Replay for agent run ${runId} not stored: ${(err as Error).message}`,
      );
    }
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

    // Texas: no buyer marketing until the equitable-interest notice is on
    // file. Checked before anything is applied, so the run stays open and
    // can be approved again once the document is uploaded.
    if (
      run.entityType === 'deal' &&
      run.entityId &&
      pending.some((a) => a.type === 'queue_buyer_blast')
    ) {
      await this.disclosure.assertEquitableInterest(
        accountId,
        run.entityId,
        'marketing this deal to buyers',
      );
      // A blast markets the contract like a campaign does: only while the
      // deal passes the disposition gate, and never alongside a campaign
      // already reaching the same buyers (docs/contract-flipping.md s5).
      await this.eligibility.assertEligible(
        accountId,
        run.entityId,
        'marketing this deal to buyers',
      );
      const campaign = await this.prisma.dispositionCampaign.findFirst({
        where: {
          accountId,
          dealId: run.entityId,
          status: { in: ['active', 'paused'] },
        },
        select: { id: true },
      });
      if (campaign) {
        throw new BadRequestException(
          'A buyer campaign is already running for this deal; outreach goes through it. Reject this blast, or end the campaign first.',
        );
      }
    }

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
          case 'record_buyer_offer': {
            out.push(await this.recordBuyerOffer(accountId, run, action));
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
   *
   * The model's judgement (ARV, repairs, confidence) is kept; the money is
   * not. The MAO and the offer range written to the deal come from the
   * deterministic underwriting (packages/shared disposition/underwriting.ts),
   * with the model's own figures kept beside them for comparison.
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
      select: {
        id: true,
        propertyId: true,
        economics: {
          select: {
            assignmentFee: true,
            contractPrice: true,
            closingCosts: true,
            marketingCost: true,
            otherCost: true,
            skipTraceCost: true,
          },
        },
        property: { select: { salePrice: true } },
      },
    });
    if (!deal) throw new Error('deal not found');
    const cp = await this.controlPlane.getStatus(accountId);
    const e = deal.economics;
    const knownCosts =
      (e?.closingCosts ?? 0) +
      (e?.marketingCost ?? 0) +
      (e?.otherCost ?? 0) +
      (e?.skipTraceCost ?? 0);
    const u = underwriteDeal({
      arv: action.arv,
      repairEstimate: action.repairEstimate,
      assignmentFee: assignmentFeeFor(
        e?.assignmentFee,
        cp.defaultAssignmentFee,
      ),
      transactionCosts:
        knownCosts > 0 ? knownCosts : (cp.dispositionCosts ?? 0),
      minNetProfit: cp.minNetProfit ?? 5000,
      confidence: action.confidence,
      minConfidence: cp.minUnderwritingConfidence ?? 0.5,
      contractPrice: e?.contractPrice ?? null,
      sellerAsk: deal.property?.salePrice ?? null,
    });
    const write = await this.prisma.deal.updateMany({
      where: {
        id: dealId,
        accountId,
        updatedAt: new Date(action.dealUpdatedAt),
      },
      data: {
        arv: action.arv,
        repairEstimate: action.repairEstimate,
        mao: u.mao,
      },
    });
    const stale = write.count === 0;
    const numbers = {
      arv: action.arv,
      repairEstimate: action.repairEstimate,
      mao: u.mao,
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
        offerRange: u.offerRange,
        // What the model computed itself, kept for comparison only.
        modelMao: action.mao,
        modelOfferRange: { low: action.offerLow, high: action.offerHigh },
        underwriting: {
          recommendation: u.recommendation,
          flags: u.flags,
          investorMax: u.investorMax,
          expectedNet: u.expectedNet,
        },
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
      if (action.recipientType === 'buyer') {
        return await this.createBuyerReplyDraft(
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
      // The person approved the run, so the draft goes to the approval
      // queue like a buyer draft does. It used to stay a `draft` that no
      // screen submitted, so approved seller replies never reached anyone.
      let submitted = '';
      try {
        await this.agentService.requestSend(draft.message.id, accountId, {
          agentName: agent,
          automationRunId: run.id,
        });
      } catch (err) {
        submitted = `; left as a draft: ${(err as Error).message}`;
      }
      return {
        action,
        result: 'applied',
        detail: `message:${draft.message.id}${submitted}`,
      };
    } catch (err) {
      // A compliance refusal (DNC, missing consent, quiet hours) leaves the
      // run open with the reason, like the Texas disclosure gate, so it can
      // be approved again once resolved. Anything else is a failed step.
      if (err instanceof ForbiddenException) throw err;
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
   * A price a buyer named in a reply, recorded as an agent-captured offer
   * on the deal (docs/contract-flipping.md s5). It is a fact for a person
   * to confirm: an agent-captured offer cannot be accepted until someone
   * checks the amount against the message. Deals without an executed seller
   * contract have nothing to offer on, and the capture is skipped.
   */
  private async recordBuyerOffer(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    action: Extract<AgentAction, { type: 'record_buyer_offer' }>,
  ): Promise<AppliedAction> {
    if (run.entityType !== 'deal' || !run.entityId) {
      throw new Error('no deal on this run');
    }
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      run.entityId,
    );
    if (!agreement || agreement.status !== 'executed') {
      return {
        action,
        result: 'skipped',
        detail: 'no executed seller contract on this deal to take offers on',
      };
    }
    const message = await this.prisma.message.findFirst({
      where: { id: action.messageId, accountId, direction: 'inbound' },
      select: { channel: true },
    });
    const offer = await this.offers.recordFromAgent(accountId, run.entityId, {
      buyerId: action.buyerId,
      amount: action.amount,
      kind: action.kind,
      source: message?.channel === 'sms' ? 'sms' : 'email',
      sourceMessageId: action.messageId,
      conditions: action.terms ?? undefined,
      confidence: action.confidence,
      automationRunId: run.id,
    });
    return {
      action,
      result: 'applied',
      detail: `offer:${offer.id} (to be confirmed by a person)`,
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

  /**
   * A reply to a buyer (Buyer Responder): one message to the address the
   * buyer wrote from, else the buyer's own on file, created through the
   * communications service so DNC, consent, quiet hours and the Texas
   * disclosure gate apply as to any buyer message, and it lands in the
   * approval queue like the blast.
   */
  private async createBuyerReplyDraft(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    agent: AgentName,
    action: Extract<AgentAction, { type: 'draft_message' }>,
    userId: string,
  ): Promise<AppliedAction> {
    if (run.entityType !== 'deal' || !run.entityId) {
      throw new Error('no deal on this run');
    }
    if (!action.buyerId) throw new Error('a buyer draft needs a buyer');
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: action.buyerId, accountId },
      select: { id: true, name: true, emailEnc: true, phoneEnc: true },
    });
    if (!buyer) throw new Error('buyer not found');
    const inbound = action.inReplyToMessageId
      ? await this.prisma.message.findFirst({
          where: {
            id: action.inReplyToMessageId,
            accountId,
            direction: 'inbound',
          },
          select: { channel: true, counterpartyEnc: true },
        })
      : null;
    const wroteFrom =
      inbound && inbound.channel === action.channel
        ? openCounterparty(inbound)
        : null;
    const sealed = action.channel === 'sms' ? buyer.phoneEnc : buyer.emailEnc;
    const address = wroteFrom ?? (sealed ? openValue(sealed) : null);
    if (!address) {
      return {
        action,
        result: 'skipped',
        detail: `${buyer.name} has no ${action.channel === 'sms' ? 'phone' : 'email'} on file`,
      };
    }
    const message = await this.communications.create({
      accountId,
      dealId: run.entityId,
      channel: action.channel,
      direction: 'outbound',
      content: action.content,
      metadata: {
        ...(action.channel === 'sms' ? { phone: address } : { email: address }),
        recipientType: 'buyer',
        buyerId: buyer.id,
        buyerName: buyer.name,
        type: 'buyer_reply',
        subject: action.subject,
        inReplyToMessageId: action.inReplyToMessageId,
        agentName: agent,
        automationRunId: run.id,
        approvedRunBy: userId,
      },
      source: 'agent',
      agentName: agent,
      automationRunId: run.id,
    } as Parameters<CommunicationsService['create']>[0]);
    return { action, result: 'applied', detail: `message:${message.id}` };
  }

  /**
   * Skip trace costs money per record, so cost control only allows it for
   * leads scored at or above its threshold, and a new lead has no score
   * until the Lead Analyst gives it one. Right after the Analyst scores a
   * lead high enough (and did not disqualify it), the trace runs here, so
   * the contacts are on the lead by the time a person approves the drafts.
   * Fire and forget: the worker's report must not wait on a provider.
   */
  private skipTraceAfterScore(
    accountId: string,
    run: { id: string; entityType: string | null; entityId: string | null },
    decision: AgentDecision,
  ): void {
    if (decision.agent !== 'lead_analyst' || run.entityType !== 'lead') return;
    if (!run.entityId || decision.recommendation === 'disqualified') return;
    const scored = decision.actions.find(
      (a): a is Extract<AgentAction, { type: 'set_lead_score' }> =>
        a.type === 'set_lead_score',
    );
    const minScore = thresholdFor(
      'batch_skiptrace',
      'append_contacts',
    ).minScore;
    if (!scored || scored.score < minScore) return;
    const leadId = run.entityId;
    void (async () => {
      try {
        const lead = await this.prisma.lead.findFirst({
          where: { id: leadId, accountId },
          select: { canonicalPhoneHash: true, canonicalEmailHash: true },
        });
        if (!lead || lead.canonicalPhoneHash || lead.canonicalEmailHash) return;
        const result = await this.skipTrace.traceLead({
          accountId,
          leadId,
          actor: 'system',
          automated: true,
        });
        await this.timeline.appendEvent({
          tenantId: accountId,
          entityType: TimelineEntityType.LEAD,
          entityId: leadId,
          eventType: 'SKIP_TRACE_AFTER_SCORE',
          payload: {
            automationRunId: run.id,
            score: scored.score,
            status: result.status,
            phones: result.phones.length,
            emails: result.emails.length,
          },
          actorId: null,
          actorType: TimelineActorType.system,
        });
      } catch (err) {
        this.logger.warn(
          `Skip trace after scoring lead ${leadId} did not run: ${(err as Error).message}`,
        );
      }
    })();
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
