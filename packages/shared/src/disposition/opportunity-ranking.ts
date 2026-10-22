import type { UnderwritingRecommendation } from './underwriting';

/**
 * Which early-stage deals to work first. Deterministic and explained: each
 * point comes from a recorded fact, and each fact is named in the reasons.
 *
 * - Acquisition: how likely the seller is to sign (the Lead Analyst's
 *   score, a seller who is replying).
 * - Margin: the expected profit from the deterministic underwriting,
 *   against the tenant's minimum.
 * - Demand: contactable buyers who fit the deal, from the buyer ranking.
 * - Velocity: how recently anything happened.
 * - Risk: low-confidence numbers, title issues, no way to reach the seller.
 */

export interface OpportunityInput {
  id: string;
  label: string;
  stage: string;
  /** Lead Analyst score, 0-100. */
  leadScore: number | null;
  /** The seller has replied to us. */
  sellerEngaged: boolean;
  underwriting: {
    recommendation: UnderwritingRecommendation;
    expectedNet: number | null;
    flags: string[];
  } | null;
  /** Contactable buyers who fit, and those who fit strongly (score >= 60). */
  demand: { contactable: number; strong: number };
  /** Days since the last message, stage change or note. */
  daysSinceActivity: number | null;
  risk: { titleIssues: number; noSellerContact: boolean };
}

export interface RankedOpportunity {
  id: string;
  label: string;
  stage: string;
  score: number;
  components: {
    acquisition: number;
    margin: number;
    demand: number;
    velocity: number;
    risk: number;
  };
  reasons: string[];
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function scoreOpportunity(o: OpportunityInput, minNetProfit: number): RankedOpportunity {
  const reasons: string[] = [];

  let acquisition = 0;
  if (o.leadScore != null) {
    acquisition = Math.round(Math.max(0, Math.min(100, o.leadScore)) * 0.25);
    reasons.push(`Lead score ${Math.round(o.leadScore)}`);
  }
  if (o.sellerEngaged) {
    acquisition += 5;
    reasons.push('Seller is replying');
  }

  let margin = 0;
  const u = o.underwriting;
  if (!u) {
    reasons.push('Not underwritten yet');
  } else if (u.recommendation === 'pass') {
    reasons.push('Underwriting says pass');
  } else if (u.expectedNet != null) {
    const ratio = minNetProfit > 0 ? u.expectedNet / minNetProfit : u.expectedNet > 0 ? 3 : 0;
    margin = ratio >= 3 ? 30 : ratio >= 2 ? 22 : ratio >= 1 ? 12 : 0;
    reasons.push(`Expected net ${money(u.expectedNet)}`);
  }

  let demand = 0;
  if (o.demand.strong >= 3) demand = 20;
  else if (o.demand.strong >= 1) demand = 12;
  else if (o.demand.contactable > 0) demand = 5;
  reasons.push(
    o.demand.contactable === 0
      ? 'No contactable buyer fits yet'
      : `${o.demand.strong} strong / ${o.demand.contactable} contactable buyer fit(s)`,
  );

  let velocity = 2;
  if (o.daysSinceActivity != null) {
    if (o.daysSinceActivity <= 3) velocity = 10;
    else if (o.daysSinceActivity <= 10) velocity = 6;
    else reasons.push(`Quiet for ${o.daysSinceActivity} days`);
  }

  let risk = 0;
  if (u?.flags.includes('low_confidence') || u?.flags.includes('no_confidence')) {
    risk -= 6;
    reasons.push('Numbers need review');
  }
  if (o.risk.titleIssues > 0) {
    risk -= Math.min(16, 8 * o.risk.titleIssues);
    reasons.push(`${o.risk.titleIssues} open title issue(s)`);
  }
  if (o.risk.noSellerContact) {
    risk -= 6;
    reasons.push('No way to reach the seller');
  }

  const score = Math.max(0, Math.min(100, acquisition + margin + demand + velocity + risk));
  return {
    id: o.id,
    label: o.label,
    stage: o.stage,
    score,
    components: { acquisition, margin, demand, velocity, risk },
    reasons,
  };
}

/** Best first; ties by label for a stable order. */
export function rankOpportunities(items: OpportunityInput[], minNetProfit: number): RankedOpportunity[] {
  return items
    .map((o) => scoreOpportunity(o, minNetProfit))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
