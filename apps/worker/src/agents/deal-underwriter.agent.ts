import {
  AGENT_TIER,
  DEAL_UNDERWRITER_PROMPT_VERSION,
  agentWorkflow,
  parseDealUnderwriterOutput,
  prompts,
  resolveAgentModel,
  type AgentAction,
  type AgentDecision,
  type AgentModels,
  type DealUnderwriterOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import type { DealUnderwriterContext } from './deal-context';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';

const MAX_CONTEXT_CHARS = 10000;

export interface UnderwriterHardRule {
  rule: string;
  reason: string;
}

/** Without a property there is nothing to value; the run records why. */
export function hardRule(
  ctx: DealUnderwriterContext,
): UnderwriterHardRule | null {
  if (!ctx.property || !ctx.property.address || !ctx.property.zip) {
    return {
      rule: 'no_property',
      reason: 'The deal has no property with a street address and ZIP',
    };
  }
  return null;
}

export function decisionFromHardRule(
  rule: UnderwriterHardRule,
): AgentDecision {
  return {
    agent: 'deal_underwriter',
    promptVersion: DEAL_UNDERWRITER_PROMPT_VERSION,
    model: null,
    recommendation: 'hold',
    summary: `hold by rule ${rule.rule}: ${rule.reason}`,
    rationale: rule.reason,
    confidence: 1,
    hardRule: rule.rule,
    actions: [
      { type: 'append_note', note: `${rule.reason} (rule: ${rule.rule})` },
    ],
  };
}

const usd = (n: number | null) =>
  n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`;

export function decisionFromOutput(
  out: DealUnderwriterOutput,
  model: string,
  ctx: DealUnderwriterContext,
): AgentDecision {
  const actions: AgentAction[] = [
    {
      type: 'set_deal_economics',
      arv: out.arv,
      repairEstimate: out.repair_estimate,
      mao: out.mao,
      confidence: out.confidence,
      offerLow: out.offer_low,
      offerHigh: out.offer_high,
      rationale: out.rationale,
      compsSummary: out.comps_summary,
      dealUpdatedAt: ctx.deal.updatedAt,
    },
    { type: 'append_note', note: out.rationale },
  ];
  const range =
    out.offer_low != null || out.offer_high != null
      ? ` ${usd(out.offer_low)}-${usd(out.offer_high)}`
      : '';
  return {
    agent: 'deal_underwriter',
    promptVersion: DEAL_UNDERWRITER_PROMPT_VERSION,
    model,
    recommendation: out.recommendation,
    summary: `${out.recommendation}${range}: ARV ${usd(out.arv)}, repairs ${usd(out.repair_estimate)}, MAO ${usd(out.mao)}, confidence ${out.confidence.toFixed(2)}`,
    rationale: out.rationale,
    confidence: out.confidence,
    hardRule: null,
    actions,
  };
}

/**
 * Values a deal (design doc s3.2): one strong-tier call through the api's
 * cost-governed route, numbers applied by the api behind the stale-write
 * guard. Never contacts anyone.
 */
export class DealUnderwriterAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: DealUnderwriterContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = hardRule(ctx);
    if (rule) return { decision: decisionFromHardRule(rule), costUsd: 0 };

    const model = resolveAgentModel(
      AGENT_TIER.deal_underwriter,
      this.opts.models,
    );
    const user = prompts.deal_underwriter.user
      .split('{{dealContext}}')
      .join(JSON.stringify(ctx, null, 1).slice(0, MAX_CONTEXT_CHARS));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.deal_underwriter.system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 1200,
      dealId: ctx.deal.id,
      automationRunId: runId,
      workflow: agentWorkflow('deal_underwriter'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseDealUnderwriterOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    return {
      decision: decisionFromOutput(out, completion.model, ctx),
      costUsd,
      raw: completion.content,
    };
  }
}
