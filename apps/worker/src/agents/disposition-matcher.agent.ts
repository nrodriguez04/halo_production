import {
  AGENT_TIER,
  BUYER_PRICE_BASIS_LABEL,
  DISPOSITION_MATCHER_PROMPT_VERSION,
  agentWorkflow,
  buyerAskingPrice,
  parseDispositionMatcherOutput,
  prompts,
  resolveAgentModel,
  type AgentAction,
  type AgentDecision,
  type AgentModels,
  type BuyerPrice,
  type BuyerShortlistEntry,
  type DispositionMatcherOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import type {
  DispositionBuyer,
  DispositionContext,
} from './disposition-context';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';

const MAX_CONTEXT_CHARS = 14000;
const DEFAULT_CANDIDATES = 15;
const DEFAULT_SHORTLIST_MAX = 10;

export function matcherCandidates(): number {
  const n = Number(process.env.AGENT_MATCHER_CANDIDATES);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_CANDIDATES;
}

export function shortlistMax(): number {
  const n = Number(process.env.AGENT_MATCHER_SHORTLIST_MAX);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_SHORTLIST_MAX;
}

export interface ScoredBuyer {
  buyer: DispositionBuyer;
  /** 0-100 from the buy box, engagement and past replies. */
  score: number;
  notes: string[];
  /** Why the buyer cannot receive this blast at all, when they cannot. */
  excluded?: string;
}

const norm = (v: unknown) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(norm).filter(Boolean) : [];

/**
 * What buyers are asked to pay: the seller-side price plus the assignment
 * fee, or the price a person set (packages/shared buyerAskingPrice). The
 * seller-side figures themselves never reach a buyer.
 */
export function buyerPrice(ctx: DispositionContext): BuyerPrice | null {
  return buyerAskingPrice(ctx.deal, ctx.defaultAssignmentFee);
}

/**
 * Deterministic buy-box scoring (design doc s2.5): location, price range,
 * engagement and past replies. The model reorders within the top of this
 * list and explains; it never sees buyers that cannot be emailed.
 */
export function scoreBuyers(ctx: DispositionContext): ScoredBuyer[] {
  const city = norm(ctx.property?.city);
  const state = norm(ctx.property?.state);
  const zip = norm(ctx.property?.zip);
  const price = buyerPrice(ctx)?.price ?? null;

  const scored = ctx.buyers.map((buyer): ScoredBuyer => {
    const notes: string[] = [];
    let score = 0;
    const prefs = buyer.preferences ?? {};

    const locations = strings(prefs.locations);
    let outsideLocations = false;
    if (locations.length === 0) {
      score += 10;
      notes.push('no location preference');
    } else if (locations.some((l) => l === city || l === zip)) {
      score += 40;
      notes.push('city match');
    } else if (locations.some((l) => l === state)) {
      score += 20;
      notes.push('state match');
    } else {
      outsideLocations = true;
      notes.push('outside stated locations');
    }

    const range = (prefs.priceRange ?? null) as {
      min?: unknown;
      max?: unknown;
    } | null;
    const min = Number(range?.min);
    const max = Number(range?.max);
    if (!range || (!Number.isFinite(min) && !Number.isFinite(max))) {
      score += 10;
      notes.push('no price range');
    } else if (price == null) {
      score += 10;
      notes.push('deal has no price yet');
    } else {
      const lo = Number.isFinite(min) ? min : 0;
      const hi = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
      if (price >= lo && price <= hi) {
        score += 30;
        notes.push('price in range');
      } else if (price >= lo * 0.85 && price <= hi * 1.15) {
        score += 15;
        notes.push('price within 15% of range');
      } else {
        notes.push('price outside range');
      }
    }

    const engagement = Math.max(0, Math.min(20, buyer.engagementScore * 2));
    score += Math.round(engagement);
    if (buyer.history.replies > 0) {
      score += 10;
      notes.push(
        `${buyer.history.replies} past repl${buyer.history.replies === 1 ? 'y' : 'ies'}`,
      );
    } else if (buyer.history.sent > 0) {
      notes.push(`${buyer.history.sent} message(s) sent, no reply`);
    }

    // A buyer who said where they buy is never sent a deal elsewhere: the
    // live eval had the model blast an Alabama deal to buyers who buy only
    // in Tennessee and Texas. Buyers with no stated locations stay eligible.
    const excluded = !buyer.hasEmail
      ? 'no email on file'
      : outsideLocations
        ? "outside the buyer's stated locations"
        : undefined;
    return { buyer, score: Math.min(100, score), notes, excluded };
  });

  return scored.sort((a, b) => {
    if (!!a.excluded !== !!b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score;
  });
}

function ruleDecision(
  rule: string,
  text: string,
  consideredCount: number,
): AgentDecision {
  return {
    agent: 'disposition_matcher',
    promptVersion: DISPOSITION_MATCHER_PROMPT_VERSION,
    model: null,
    recommendation: 'hold',
    summary: `hold by rule ${rule}: ${text}`,
    rationale: text,
    confidence: 1,
    hardRule: rule,
    actions: [
      { type: 'rank_buyers', shortlist: [], consideredCount },
      { type: 'append_note', note: `${text} (rule: ${rule})` },
    ],
  };
}

/** Nothing to market, nobody to market to: decided without a model call. */
export function decideByRule(ctx: DispositionContext): AgentDecision | null {
  if (!ctx.property || !ctx.property.address) {
    return ruleDecision('no_property', 'The deal has no property to market', 0);
  }
  if (ctx.buyers.length === 0) {
    return ruleDecision(
      'no_buyers',
      'No buyers on file; add buyers before marketing this deal',
      0,
    );
  }
  const emailable = ctx.buyers.filter((b) => b.hasEmail).length;
  if (emailable === 0) {
    return ruleDecision(
      'no_contactable_buyers',
      'No buyer has an email on file, so no blast can be drafted',
      ctx.buyers.length,
    );
  }
  return null;
}

const money = (n: number | null) =>
  n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`;

export function decisionFromOutput(
  out: DispositionMatcherOutput,
  model: string,
  candidates: ScoredBuyer[],
  consideredCount: number,
  price: BuyerPrice | null = null,
): AgentDecision {
  const byId = new Map(candidates.map((c) => [c.buyer.id, c]));
  const seen = new Set<string>();
  const shortlist: BuyerShortlistEntry[] = [];
  for (const pick of out.shortlist) {
    const c = byId.get(pick.buyer_id);
    if (!c || seen.has(pick.buyer_id)) continue;
    seen.add(pick.buyer_id);
    shortlist.push({
      buyerId: c.buyer.id,
      name: c.buyer.name,
      rank: shortlist.length + 1,
      fit: pick.fit,
      reason: pick.reason,
      ruleScore: c.score,
    });
    if (shortlist.length >= shortlistMax()) break;
  }

  const actions: AgentAction[] = [
    { type: 'rank_buyers', shortlist, consideredCount },
    { type: 'append_note', note: out.rationale },
  ];
  if (shortlist.length > 0 && out.blast) {
    actions.push({
      type: 'queue_buyer_blast',
      buyerIds: shortlist.map((b) => b.buyerId),
      subject: out.blast.subject,
      body: out.blast.body,
      gated: true,
    });
  }
  const strong = shortlist.filter((b) => b.fit === 'strong').length;
  const recommendation = shortlist.length > 0 ? 'market' : 'hold';
  const asking = price
    ? ` at ${money(price.price)} (${BUYER_PRICE_BASIS_LABEL[price.basis]})`
    : '';
  const summary =
    shortlist.length > 0
      ? `market${asking}: ${shortlist.length} of ${consideredCount} buyers shortlisted (${strong} strong)${out.blast ? '; blast drafted' : ''}`
      : `hold: no buyer fits (${consideredCount} considered)`;
  return {
    agent: 'disposition_matcher',
    promptVersion: DISPOSITION_MATCHER_PROMPT_VERSION,
    model,
    recommendation,
    summary,
    rationale: out.rationale,
    hardRule: null,
    actions,
  };
}

/**
 * Ranks buyers for a deal under contract and drafts the blast (design doc
 * s3.4). Rules and the buy-box score first, then one mid-tier call over the
 * top candidates. Ranking is autonomous; the blast waits for a person and
 * then goes through the communications approval queue like any email.
 */
export class DispositionMatcherAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: DispositionContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = decideByRule(ctx);
    if (rule) return { decision: rule, costUsd: 0 };

    const scored = scoreBuyers(ctx);
    const candidates = scored
      .filter((c) => !c.excluded)
      .slice(0, matcherCandidates());
    if (candidates.length === 0) {
      const where = [ctx.property?.city, ctx.property?.state]
        .filter(Boolean)
        .join(', ');
      return {
        decision: ruleDecision(
          'no_buyer_in_area',
          `No contactable buyer's stated locations cover ${where || 'this property'}`,
          ctx.buyers.length,
        ),
        costUsd: 0,
      };
    }
    const model = resolveAgentModel(
      AGENT_TIER.disposition_matcher,
      this.opts.models,
    );
    const price = buyerPrice(ctx);
    // The asking price is the only price the model sees. The offer made to
    // the seller, the contract price, the MAO and the Underwriter's offer
    // range stay out of its view, so none of them can reach a buyer.
    const modelContext = {
      deal: {
        id: ctx.deal.id,
        stage: ctx.deal.stage,
        askingPrice: price?.price ?? null,
        arv: ctx.deal.arv,
        repairEstimate: ctx.deal.repairEstimate,
      },
      property: ctx.property,
      underwriting: ctx.underwriting
        ? { confidence: ctx.underwriting.confidence }
        : null,
      team: ctx.team,
      priorBlasts: ctx.priorBlasts,
      candidates: candidates.map((c) => ({
        buyer_id: c.buyer.id,
        name: c.buyer.name,
        preferences: c.buyer.preferences,
        engagementScore: c.buyer.engagementScore,
        lastContacted: c.buyer.lastContacted,
        history: c.buyer.history,
        ruleScore: c.score,
        notes: c.notes,
      })),
      figures: {
        askingPrice: money(price?.price ?? null),
        arv: money(ctx.deal.arv),
        repairs: money(ctx.deal.repairEstimate),
      },
    };
    const user = prompts.disposition_matcher.user
      .split('{{context}}')
      .join(JSON.stringify(modelContext, null, 1).slice(0, MAX_CONTEXT_CHARS))
      .split('{{max}}')
      .join(String(shortlistMax()));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.disposition_matcher.system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      maxTokens: 1200,
      dealId: ctx.deal.id,
      automationRunId: runId,
      workflow: agentWorkflow('disposition_matcher'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseDispositionMatcherOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    return {
      decision: decisionFromOutput(
        out,
        completion.model,
        candidates,
        candidates.length,
        price,
      ),
      costUsd,
      raw: completion.content,
    };
  }
}
