import type { AssetClass, AssetSubtype } from './taxonomy';

/**
 * The one shape every underwriting strategy returns (docs/asset-classes.md
 * s5), so the deal page, the agents and the offer bounds read residential,
 * land and commercial deals the same way. Every figure is deterministic and
 * comes with the evidence behind it; a model explains the result, it never
 * produces one.
 */

export type UnderwritingStrategy = 'residential_arv' | 'land_comparables' | 'commercial_income_and_sales';

export type AssetDecision = 'pursue' | 'review' | 'pass';

export const ASSET_DECISION_LABEL: Record<AssetDecision, string> = {
  pursue: 'Pursue',
  review: 'Review first',
  pass: 'Pass',
};

export interface ValueRange {
  low: number;
  mid: number;
  high: number;
}

export interface ValuationApproach {
  key: 'arv' | 'land_price_per_acre' | 'income_capitalization' | 'sales_price_per_sqft' | 'sales_price_per_unit';
  label: string;
  /** Null when the approach could not be applied; `note` says why. */
  range: ValueRange | null;
  /** The per-unit figure behind it (per acre, per sq ft, per unit), rounded. */
  unitValue: ValueRange | null;
  unit: 'acre' | 'sq ft' | 'unit' | null;
  evidenceCount: number;
  note: string;
}

export type EvidenceKind = 'comparable_sale' | 'fact' | 'document' | 'assumption' | 'buyer_demand';

export interface UnderwritingEvidence {
  kind: EvidenceKind;
  text: string;
  /** A record id or source reference, when there is one. */
  ref?: string | null;
}

export interface UnderwritingConfidence {
  /** 0-1, from the evidence; never a model's self-rating. */
  score: number;
  level: 'high' | 'medium' | 'low';
}

export interface BuyerDemand {
  level: 'strong' | 'some' | 'none' | 'unknown';
  /** Buyers who fit and can be contacted. */
  matchingBuyers: number;
  detail: string;
}

export interface SensitivityCell {
  capRate: number;
  noiChange: number;
  value: number;
}

export interface AssetUnderwriting {
  assetClass: AssetClass;
  subtype: AssetSubtype | null;
  strategy: UnderwritingStrategy;
  /** The overall value range; null when nothing supports one. */
  valuation: ValueRange | null;
  approaches: ValuationApproach[];
  evidence: UnderwritingEvidence[];
  confidence: UnderwritingConfidence;
  /** What is not on file that the decision needs, in plain words. */
  missing: string[];
  risks: string[];
  /** The assumptions the arithmetic made, each named. */
  assumptions: string[];
  /** What to offer the seller; null when no price is supportable. */
  offerRange: { low: number; high: number } | null;
  targetFee: number;
  /** What a buyer is expected to pay for the contract. */
  expectedBuyerPrice: number | null;
  expectedNet: number | null;
  buyerDemand: BuyerDemand;
  decision: AssetDecision;
  /** One sentence for the deal list. */
  summary: string;
  /** The reasoning, in order, for an owner who is not a real estate expert. */
  explanation: string[];
  /** Commercial only: value across cap rates and NOI changes, when the inputs allow it. */
  sensitivity: SensitivityCell[] | null;
}

/**
 * Valuations are shown at the precision the evidence supports, not to the
 * dollar: nearest $1,000 under $100,000, $5,000 under $1M, $25,000 above.
 */
export function roundValue(n: number): number {
  const step = n < 100_000 ? 1_000 : n < 1_000_000 ? 5_000 : 25_000;
  return Math.round(n / step) * step;
}

export function roundRange(r: ValueRange): ValueRange {
  return { low: roundValue(r.low), mid: roundValue(r.mid), high: roundValue(r.high) };
}

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function quantile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

export function confidenceLevel(score: number): UnderwritingConfidence {
  const s = Math.max(0, Math.min(1, Math.round(score * 100) / 100));
  return { score: s, level: s >= 0.7 ? 'high' : s >= 0.5 ? 'medium' : 'low' };
}

/** Buyer demand from the deal's ranked buyers: contactable buyers whose fit clears the bar. */
export function buyerDemandFrom(matches: Array<{ contactable: boolean; score: number }> | null): BuyerDemand {
  if (!matches) return { level: 'unknown', matchingBuyers: 0, detail: 'Buyers have not been matched to this deal yet.' };
  const fit = matches.filter((m) => m.contactable && m.score >= 50).length;
  if (matches.length === 0) return { level: 'unknown', matchingBuyers: 0, detail: 'No buyers on file to match against.' };
  if (fit >= 3) return { level: 'strong', matchingBuyers: fit, detail: `${fit} contactable buyers fit this deal.` };
  if (fit > 0) return { level: 'some', matchingBuyers: fit, detail: `${fit} contactable buyer${fit === 1 ? '' : 's'} fit${fit === 1 ? 's' : ''} this deal.` };
  return { level: 'none', matchingBuyers: 0, detail: 'No contactable buyer on file fits this deal well.' };
}
