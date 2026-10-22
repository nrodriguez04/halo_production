import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  decisionNeedsApproval,
  type AgentDecision,
  type AgentJobPayload,
  type AgentModels,
} from '@halo/shared';
import { prisma } from '../prisma-client';
import { getControlPlane } from '../control-plane';
import {
  CostBlockedError,
  IntegrationUnavailableError,
  InternalApiError,
  openAgentRun,
  recordAgentDecision,
  type AgentReplay,
} from '../internal-api.client';
import { loadLeadContext } from './agent-context';
import { loadDealContext } from './deal-context';
import { DealUnderwriterAgent } from './deal-underwriter.agent';
import { loadOutreachContext } from './outreach-context';
import { OutreachDrafterAgent } from './outreach-drafter.agent';
import { loadDispositionContext } from './disposition-context';
import { DispositionMatcherAgent } from './disposition-matcher.agent';
import { loadBuyerReplyContext } from './buyer-context';
import { BuyerResponderAgent } from './buyer-responder.agent';
import {
  loadMarketExpansionContext,
  loadMarketIntelligenceContext,
} from './market-context';
import { MarketIntelligenceAgent } from './market-intelligence.agent';
import { MarketExpansionAgent } from './market-expansion.agent';
import {
  AgentOutputError,
  LeadAnalystAgent,
  type LeadAnalystResult,
} from './lead-analyst.agent';

const OPEN_RUN_WINDOW_MS = 10 * 60 * 1000;
/**
 * A context larger than this (UTF-8 bytes) is not kept with the run: the
 * report has to stay well under the api's 512 kB request limit.
 */
const MAX_REPLAY_BYTES = 200_000;
/** Agents on the frame so far (design doc s10). */
const RELEASED = new Set<AgentJobPayload['agent']>([
  'lead_analyst',
  'deal_underwriter',
  'outreach_drafter',
  'disposition_matcher',
  'buyer_responder',
  'market_intelligence',
  'market_expansion',
]);

type AgentRunResult = LeadAnalystResult & { context: object };

/**
 * The context the agent decided on and the model's raw reply, so the run
 * can be replayed and a reviewed run can become a golden case.
 */
export function replayOf(
  context: object,
  reply: string | undefined,
): AgentReplay | undefined {
  if (Buffer.byteLength(JSON.stringify(context)) > MAX_REPLAY_BYTES) {
    return undefined;
  }
  return {
    context: context as Record<string, unknown>,
    reply: reply ?? null,
  };
}

export interface AgentJobResult {
  runId?: string;
  status?: string;
  recommendation?: string;
  skipped?: string;
}

/**
 * One processor for every agent, dispatching on `payload.agent`. Each job
 * is one AutomationRun: opened through the api before any work, closed
 * with the decision (or the reason it could not decide). The processor
 * never writes domain tables itself; the api applies the decision within
 * the tenant's autonomy tier.
 */
@Processor('agents')
export class AgentsProcessor extends WorkerHost {
  async process(job: Job<AgentJobPayload>): Promise<AgentJobResult> {
    const p = job.data;
    const controlPlane = await getControlPlane(p.accountId);
    if (!controlPlane.enabled || !controlPlane.aiEnabled) {
      return { skipped: 'ai disabled for tenant' };
    }
    if (!RELEASED.has(p.agent)) {
      return { skipped: `agent ${p.agent} is not released yet` };
    }

    // A lifecycle re-fire while a run is open (or awaiting a person) must
    // not pile a second opinion on the same entity. Manual runs always go,
    // and so does every inbound reply: each one deserves its own answer.
    if (p.trigger !== 'manual' && p.trigger !== 'inbound') {
      const open = await prisma.automationRun.findFirst({
        where: {
          tenantId: p.accountId,
          agentName: p.agent,
          entityType: p.entityType,
          entityId: p.entityId,
          status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] },
          createdAt: { gte: new Date(Date.now() - OPEN_RUN_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (open) return { skipped: `run ${open.id} already open` };
    }

    const run = await openAgentRun(p.accountId, {
      agent: p.agent,
      entityType: p.entityType,
      entityId: p.entityId,
      trigger: p.trigger,
      triggerEventId: p.triggerEventId,
      actorId: p.actorId ?? null,
    });

    try {
      const result = await this.runAgent(p, controlPlane.agentModels, run.id);
      if (!result) {
        const noun =
          p.entityType === 'deal'
            ? 'Deal'
            : p.entityType === 'market'
              ? 'Market'
              : 'Lead';
        await recordAgentDecision(p.accountId, run.id, {
          status: 'FAILED',
          error: `${noun} ${p.entityId} not found`,
        });
        return { runId: run.id, status: 'FAILED' };
      }
      const { decision, costUsd } = result;
      const status = decisionNeedsApproval(decision)
        ? 'AWAITING_APPROVAL'
        : 'COMPLETED';
      await recordAgentDecision(p.accountId, run.id, {
        status,
        decision,
        costUsd,
        replay: replayOf(result.context, result.raw),
      });
      return { runId: run.id, status, recommendation: decision.recommendation };
    } catch (err) {
      return this.closeOnError(p, run.id, err);
    }
  }

  /** Loads the entity's context and runs the agent; null when the entity is gone. */
  private async runAgent(
    p: AgentJobPayload,
    agentModels: unknown,
    runId: string,
  ): Promise<AgentRunResult | null> {
    const models = agentModels as AgentModels | null;
    const withContext = async (
      context: object,
      run: Promise<LeadAnalystResult>,
    ): Promise<AgentRunResult> => ({ ...(await run), context });
    if (p.agent === 'deal_underwriter') {
      const ctx = await loadDealContext(p.entityId, p.accountId);
      if (!ctx) return null;
      const agent = new DealUnderwriterAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    if (p.agent === 'disposition_matcher') {
      const ctx = await loadDispositionContext(p.entityId, p.accountId);
      if (!ctx) return null;
      const agent = new DispositionMatcherAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    if (p.agent === 'buyer_responder') {
      const ctx = await loadBuyerReplyContext(p);
      if (!ctx) return null;
      const agent = new BuyerResponderAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    if (p.agent === 'market_intelligence') {
      const ctx = await loadMarketIntelligenceContext(p.entityId, p.accountId);
      const agent = new MarketIntelligenceAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    if (p.agent === 'market_expansion') {
      const ctx = await loadMarketExpansionContext(p.entityId, p.accountId);
      const agent = new MarketExpansionAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    if (p.agent === 'outreach_drafter') {
      const ctx = await loadOutreachContext(p);
      if (!ctx) return null;
      const agent = new OutreachDrafterAgent({ models });
      return withContext(ctx, agent.run(ctx, p.accountId, runId));
    }
    const ctx = await loadLeadContext(p.entityId, p.accountId);
    if (!ctx) return null;
    const agent = new LeadAnalystAgent({ models });
    return withContext(ctx, agent.run(ctx, p.accountId, runId));
  }

  /**
   * Blocked by budget: recorded as cancelled, not failed (design doc s2.4).
   * Provider down or bad output: failed with the reason, no retry, since a
   * retry would spend again for the same answer. Only an api outage is
   * rethrown so BullMQ retries it.
   */
  private async closeOnError(
    p: AgentJobPayload,
    runId: string,
    err: unknown,
  ): Promise<AgentJobResult> {
    if (err instanceof CostBlockedError) {
      await recordAgentDecision(p.accountId, runId, {
        status: 'CANCELLED',
        decision: blockedDecision(p, `blocked by cost control: ${err.reason}`),
      });
      return { runId, status: 'CANCELLED', skipped: err.reason };
    }
    if (err instanceof InternalApiError && err.status >= 500) {
      throw err;
    }
    const message =
      err instanceof AgentOutputError
        ? `${err.message}: ${err.raw.slice(0, 300)}`
        : err instanceof IntegrationUnavailableError
          ? `${err.provider} unavailable (${err.reason}): ${err.message}`
          : (err as Error).message;
    await recordAgentDecision(p.accountId, runId, {
      status: 'FAILED',
      error: message,
    });
    return { runId, status: 'FAILED' };
  }
}

function blockedDecision(p: AgentJobPayload, summary: string): AgentDecision {
  return {
    agent: p.agent,
    promptVersion: 'n/a',
    model: null,
    recommendation: 'blocked',
    summary,
    rationale: summary,
    hardRule: null,
    actions: [],
  };
}
