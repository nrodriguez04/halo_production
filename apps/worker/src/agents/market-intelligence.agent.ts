import {
  AGENT_TIER,
  MARKET_INTELLIGENCE_PROMPT_VERSION,
  agentWorkflow,
  legalClearanceClaim,
  parseMarketIntelligenceOutput,
  prompts,
  resolveAgentModel,
  type AgentDecision,
  type AgentModels,
  type MarketBrief,
  type MarketIntelligenceOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import type { MarketIntelligenceContext } from './market-context';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';

const MAX_CONTEXT_CHARS = 16000;
/** Priorities the brief explains at most. */
export const BRIEF_MAX_PRIORITIES = 5;

export interface MarketIntelligenceHardRule {
  rule: string;
  reason: string;
}

/**
 * Without ranked candidates there is nothing to explain, and asking a model
 * would only produce prose about no data. No recorded sales means every
 * opportunity is zero.
 */
export function hardRule(
  ctx: MarketIntelligenceContext,
): MarketIntelligenceHardRule | null {
  const ranked = ctx.candidates.filter((c) => c.opportunity > 0);
  if (ctx.coverage.counties === 0 || ranked.length === 0) {
    return {
      rule: 'no_data',
      reason: `No recorded sales on file for ${ctx.scope === 'US' ? 'any state' : ctx.scope}, so every market scores zero. Import county sales or connect a property-data provider, then ask again.`,
    };
  }
  return null;
}

function holdDecision(
  rule: MarketIntelligenceHardRule,
  ctx: MarketIntelligenceContext,
): AgentDecision {
  const brief: MarketBrief = {
    scope: ctx.scope,
    asOf: ctx.asOf,
    summary: rule.reason,
    priorities: [],
    dataGaps: [rule.reason],
  };
  return {
    agent: 'market_intelligence',
    promptVersion: MARKET_INTELLIGENCE_PROMPT_VERSION,
    model: null,
    recommendation: 'hold',
    summary: `hold by rule ${rule.rule}: ${rule.reason}`,
    rationale: rule.reason,
    confidence: 1,
    hardRule: rule.rule,
    actions: [{ type: 'record_market_brief', brief }],
  };
}

/**
 * The model's explanation, bound to Halo's ranking: priorities naming a
 * key that is not a candidate are dropped, and the rest are put back in
 * ranking order whatever order the model wrote them in.
 */
export function decisionFromOutput(
  out: MarketIntelligenceOutput,
  model: string,
  ctx: MarketIntelligenceContext,
): AgentDecision {
  const byKey = new Map(ctx.candidates.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const dropped: string[] = [];
  const priorities: MarketBrief['priorities'] = [];
  for (const p of out.priorities) {
    const c = byKey.get(p.key);
    if (!c) {
      dropped.push(p.key);
      continue;
    }
    if (seen.has(c.key)) continue;
    seen.add(c.key);
    priorities.push({
      key: c.key,
      label: c.label,
      rank: c.rank,
      why: p.why.trim(),
      risks: p.risks.trim(),
      verify: p.verify.map((v) => v.trim()).filter(Boolean),
    });
  }
  priorities.sort((a, b) => a.rank - b.rank);
  const kept = priorities.slice(0, BRIEF_MAX_PRIORITIES);
  const brief: MarketBrief = {
    scope: ctx.scope,
    asOf: ctx.asOf,
    summary: out.summary.trim(),
    priorities: kept,
    dataGaps: out.data_gaps.map((g) => g.trim()).filter(Boolean),
  };
  const names = kept.map((p) => p.label).join(', ');
  return {
    agent: 'market_intelligence',
    promptVersion: MARKET_INTELLIGENCE_PROMPT_VERSION,
    model,
    recommendation: kept.length ? 'brief' : 'hold',
    summary: kept.length
      ? `${kept.length} priorit${kept.length === 1 ? 'y' : 'ies'} explained: ${names}`
      : 'No candidate explained',
    rationale: dropped.length
      ? `${out.rationale} (Dropped keys that are not candidates: ${dropped.join(', ')}.)`
      : out.rationale,
    hardRule: null,
    actions: [{ type: 'record_market_brief', brief }],
  };
}

/**
 * Explains Halo's market ranking (design doc s3.6). The ranking is computed
 * without the model; the model only writes why the top candidates rank
 * where they do, their risks and what to verify. Records the brief on the
 * run and changes nothing else.
 */
export class MarketIntelligenceAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: MarketIntelligenceContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = hardRule(ctx);
    if (rule) return { decision: holdDecision(rule, ctx), costUsd: 0 };

    const model = resolveAgentModel(
      AGENT_TIER.market_intelligence,
      this.opts.models,
    );
    const user = prompts.market_intelligence.user
      .split('{{context}}')
      .join(JSON.stringify(ctx, null, 1).slice(0, MAX_CONTEXT_CHARS))
      .split('{{max}}')
      .join(String(BRIEF_MAX_PRIORITIES));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.market_intelligence.system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 1500,
      automationRunId: runId,
      workflow: agentWorkflow('market_intelligence'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseMarketIntelligenceOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    const claim = legalClearanceClaim(
      [
        out.summary,
        ...out.priorities.flatMap((p) => [p.why, p.risks, ...p.verify]),
      ].join('\n'),
    );
    if (claim) {
      throw new AgentOutputError(
        `The reply says a market is cleared to operate in ("${claim}"); only counsel's approval does that`,
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
