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

const usd = (n: number | null) =>
  n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`;

export interface UnderwriterHardRule {
  rule: string;
  reason: string;
}

/** Source fields that state what a property is worth or sold or listed for. */
const VALUE_FIELDS =
  /^(marketValue|assessedValue|estimatedValue|lastSaleAmount|salePrice|listPrice|price|closePrice|soldPrice|avm)$/i;

/**
 * Whether anything on file says what the property is worth: a value, an
 * assessment, a sale or a listing price, or numbers a person entered. With
 * none, any ARV would be invented; the live eval had the model offer at
 * 0.6 confidence on a deal with no data at all.
 */
export function hasValueData(ctx: DealUnderwriterContext): boolean {
  const positive = (v: unknown) => typeof v === 'number' && v > 0;
  if (positive(ctx.deal.arv) || positive(ctx.deal.mao)) return true;
  if (positive(ctx.priorResult?.arv)) return true;
  if (positive(ctx.property?.estimatedValue) || positive(ctx.property?.salePrice))
    return true;
  return ctx.sources.some((s) =>
    Object.entries(s.summary).some(([k, v]) => VALUE_FIELDS.test(k) && positive(v)),
  );
}

/** Without a property, or anything that says what it is worth, there is nothing to value; the run records why. */
export function hardRule(
  ctx: DealUnderwriterContext,
): UnderwriterHardRule | null {
  if (!ctx.property || !ctx.property.address || !ctx.property.zip) {
    return {
      rule: 'no_property',
      reason: 'The deal has no property with a street address and ZIP',
    };
  }
  if (!hasValueData(ctx)) {
    return {
      rule: 'no_value_data',
      reason:
        'Nothing on file says what the property is worth (no value, assessment, sale or listing price); pull a property record or comparable sales, then run it again',
    };
  }
  return null;
}

/** The prompt's MAO, rounded down to $100: ARV x 0.70 - repairs - the deal fee. */
export function formulaMao(arv: number, repairs: number, fee: number): number {
  // Whole dollars first: 172,000 x 0.7 is 120,399.99999999999 in floating point.
  return Math.floor(Math.round(arv * 0.7 - repairs - fee) / 100) * 100;
}

const MIN_OFFER_CONFIDENCE = 0.4;

/**
 * The numbers Halo records, whatever the model wrote: the MAO comes from
 * the formula (the live eval found the model's arithmetic off by up to
 * $24,000), the offer range stays under it, and the prompt's own rules on
 * recommendation are applied in code.
 */
export function checkedNumbers(
  out: DealUnderwriterOutput,
  fee: number,
): { out: DealUnderwriterOutput; adjustments: string[] } {
  const adjustments: string[] = [];
  let mao = out.mao;
  if (out.arv != null && out.repair_estimate != null) {
    const formula = formulaMao(out.arv, out.repair_estimate, fee);
    if (mao == null || Math.abs(mao - formula) >= 100) {
      if (mao != null) {
        adjustments.push(
          `MAO ${usd(mao)} recomputed as ${usd(formula)} (ARV x 0.70 - repairs - the ${usd(fee)} fee)`,
        );
      }
      mao = formula;
    }
  }
  let high = out.offer_high;
  let low = out.offer_low;
  if (mao != null && high != null && high > mao) {
    adjustments.push(`offer range capped at the MAO`);
    high = Math.max(0, mao);
  }
  if (low != null && high != null && low > high) low = high;
  let recommendation = out.recommendation;
  if (recommendation === 'offer' && mao == null) {
    adjustments.push('no MAO, so hold');
    recommendation = 'hold';
  } else if (recommendation === 'offer' && mao != null && mao <= 0) {
    adjustments.push('the MAO is not positive, so pass');
    recommendation = 'pass';
  }
  if (recommendation === 'offer' && out.confidence < MIN_OFFER_CONFIDENCE) {
    adjustments.push(`confidence is below ${MIN_OFFER_CONFIDENCE}, so hold`);
    recommendation = 'hold';
  }
  return {
    out: { ...out, mao, offer_high: high, offer_low: low, recommendation },
    adjustments,
  };
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

export function decisionFromOutput(
  reply: DealUnderwriterOutput,
  model: string,
  ctx: DealUnderwriterContext,
): AgentDecision {
  const checked = checkedNumbers(reply, ctx.deal.assignmentFee);
  const out = checked.adjustments.length
    ? {
        ...checked.out,
        rationale: `${reply.rationale}\n\nAdjusted by Halo's rules: ${checked.adjustments.join('; ')}.`,
      }
    : checked.out;
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
