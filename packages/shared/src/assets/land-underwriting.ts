import { factValue, isHighRiskFloodZone, type FactRecord } from './facts';
import type { LandSubtype } from './taxonomy';
import {
  confidenceLevel,
  quantile,
  roundOffer,
  roundRange,
  roundValue,
  usd,
  type AssetUnderwriting,
  type BuyerDemand,
  type UnderwritingEvidence,
  type ValueRange,
} from './underwriting-types';

/**
 * Land underwriting (docs/asset-classes.md s5.2). Land has no after-repair
 * value, so the residential 70% rule does not apply. The value comes from
 * what comparable vacant parcels sold for per acre, in the same county,
 * recently, at a similar size; the offer works back from what a land buyer
 * is likely to pay, less our fee and the costs of carrying and checking
 * the parcel. Missing facts lower confidence and add risks; they are never
 * read as good news.
 */

export interface LandComparable {
  ref: string;
  saleDate: string;
  price: number;
  acres: number;
  county: string | null;
  zip: string | null;
  zoning?: string | null;
  landUse?: string | null;
  /** recorded | reported | estimated */
  quality?: string;
}

export interface LandUnderwritingInput {
  subject: {
    acres: number | null;
    subtype: LandSubtype | null;
    county: string | null;
    zip: string | null;
    zoning: string | null;
  };
  facts: readonly FactRecord[];
  comps: readonly LandComparable[];
  asOf: Date;
  targetFee: number;
  /** Closing, marketing and other costs paid out of the fee. */
  transactionCosts: number;
  /** Surveys, title and other checks we pay for before assigning. */
  diligenceCosts?: number;
  /** Taxes and carrying costs per month while under contract, and how long. */
  holdingCostMonthly?: number;
  holdingMonths?: number;
  minNetProfit: number;
  /**
   * What a land buyer pays as a share of the conservative market value.
   * An assumption, named in the result; buyers' own purchase history
   * (`buyerPricePerAcre`) replaces it when there is one.
   */
  buyerRatio?: number;
  /** The median $/acre matched buyers paid in this county, from their recorded purchases. */
  buyerPricePerAcre?: number | null;
  contractPrice?: number | null;
  sellerAsk?: number | null;
  buyerDemand: BuyerDemand;
}

export const DEFAULT_LAND_BUYER_RATIO = 0.75;
/** Comparable sales older than this are not used. */
export const LAND_COMP_MAX_AGE_MONTHS = 36;
/** A comparable must be between a third and three times the subject's size. */
export const LAND_COMP_SIZE_BAND = 3;
export const LAND_MIN_COMPS = 3;

const MONTH_MS = 30.44 * 86_400_000;

export function selectLandComps(input: Pick<LandUnderwritingInput, 'subject' | 'comps' | 'asOf'>): {
  used: Array<LandComparable & { perAcre: number; ageMonths: number; sameZip: boolean }>;
  excluded: number;
} {
  const acres = input.subject.acres;
  const county = input.subject.county?.trim().toLowerCase() ?? null;
  const used: Array<LandComparable & { perAcre: number; ageMonths: number; sameZip: boolean }> = [];
  let excluded = 0;
  for (const c of input.comps) {
    const ageMonths = (input.asOf.getTime() - Date.parse(c.saleDate)) / MONTH_MS;
    const ok =
      c.price > 0 &&
      c.acres > 0 &&
      ageMonths >= 0 &&
      ageMonths <= LAND_COMP_MAX_AGE_MONTHS &&
      (!county || (c.county?.trim().toLowerCase() ?? null) === county) &&
      (acres == null || (c.acres >= acres / LAND_COMP_SIZE_BAND && c.acres <= acres * LAND_COMP_SIZE_BAND));
    if (!ok) {
      excluded++;
      continue;
    }
    used.push({ ...c, perAcre: c.price / c.acres, ageMonths, sameZip: !!c.zip && c.zip === input.subject.zip });
  }
  used.sort((a, b) => a.ageMonths - b.ageMonths);
  return { used, excluded };
}

export function underwriteLand(input: LandUnderwritingInput): AssetUnderwriting {
  const evidence: UnderwritingEvidence[] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const assumptions: string[] = [];
  const explanation: string[] = [];
  const acres = input.subject.acres != null && input.subject.acres > 0 ? input.subject.acres : null;
  const costs =
    Math.max(0, input.transactionCosts) +
    Math.max(0, input.diligenceCosts ?? 0) +
    Math.max(0, input.holdingCostMonthly ?? 0) * Math.max(0, input.holdingMonths ?? 0);

  // ------------------------------------------------------------- the facts
  const access = factValue(input.facts, 'legal_access');
  const zoning = factValue(input.facts, 'zoning')?.value ?? input.subject.zoning;
  const flood = factValue(input.facts, 'flood_zone');
  const wetlands = factValue(input.facts, 'wetlands');
  const water = factValue(input.facts, 'utility_water');
  const sewer = factValue(input.facts, 'utility_sewer');
  let penalty = 0;
  if (!access) {
    missing.push('Legal access is not established: confirm road frontage or a recorded easement through title work.');
    risks.push('Without legal access the parcel may be unsellable to most buyers.');
    penalty += 0.15;
  } else if (access.value === false) {
    risks.push('The record says the parcel has no legal access (landlocked). Most buyers will pass or pay far less.');
    penalty += 0.3;
  } else if (access.status !== 'verified') {
    missing.push('Legal access is reported but not verified by title work.');
    penalty += 0.05;
  }
  if (!zoning) {
    missing.push('Zoning is not on file: check with the city or county planning office (unincorporated land may have none).');
    penalty += 0.1;
  }
  if (!flood) {
    missing.push('Flood zone is not checked: run the FEMA flood map lookup.');
    penalty += 0.05;
  } else if (typeof flood.value === 'string' && isHighRiskFloodZone(flood.value)) {
    risks.push(`FEMA flood zone ${flood.value}: high flood risk. Building needs elevation and flood insurance, and usable acreage may be smaller.`);
    penalty += 0.1;
  }
  if (wetlands && typeof wetlands.value === 'string' && !/^none/i.test(wetlands.value)) {
    risks.push(`Mapped wetlands: ${wetlands.value}. Part of the parcel may not be buildable without a federal permit.`);
    penalty += 0.05;
  }
  if (!water || !sewer) {
    missing.push('Water and sewer or septic availability are not confirmed. A nearby line is not service; ask the provider for a will-serve letter or run a perc test.');
  }

  // ---------------------------------------------------------- comparables
  if (!acres) {
    missing.unshift('Acreage is not on file, so the parcel cannot be priced per acre.');
  }
  const { used, excluded } = acres ? selectLandComps(input) : { used: [], excluded: input.comps.length };
  for (const c of used.slice(0, 8)) {
    evidence.push({
      kind: 'comparable_sale',
      ref: c.ref,
      text: `${round1(c.acres)} acres sold ${c.saleDate} for ${usd(c.price)} (${usd(roundTo(c.perAcre, 100))}/acre)${c.sameZip ? ', same ZIP' : ''}${c.quality && c.quality !== 'recorded' ? `, ${c.quality}` : ''}`,
    });
  }
  if (excluded > 0) {
    evidence.push({
      kind: 'assumption',
      text: `${excluded} other sale(s) left out: older than ${LAND_COMP_MAX_AGE_MONTHS} months, another county, or not within ${LAND_COMP_SIZE_BAND}x the size.`,
    });
  }

  let valuation: ValueRange | null = null;
  let perAcre: ValueRange | null = null;
  let compScore = 0;
  if (acres && used.length > 0) {
    const sorted = used.map((c) => c.perAcre).sort((a, b) => a - b);
    const p25 = quantile(sorted, 0.25)!;
    const med = quantile(sorted, 0.5)!;
    const p75 = quantile(sorted, 0.75)!;
    perAcre = { low: roundTo(p25, 100), mid: roundTo(med, 100), high: roundTo(p75, 100) };
    valuation = roundRange({ low: acres * p25, mid: acres * med, high: acres * p75 });
    const spread = med > 0 ? (p75 - p25) / med : 1;
    compScore = used.length >= 10 ? 0.8 : used.length >= 5 ? 0.7 : used.length >= LAND_MIN_COMPS ? 0.6 : 0.35;
    if (spread > 0.6) {
      compScore -= 0.15;
      risks.push('Comparable prices per acre vary widely, so the value range is wide.');
    }
    if (used.length < LAND_MIN_COMPS) {
      missing.push(`Only ${used.length} comparable vacant-land sale(s); at least ${LAND_MIN_COMPS} are needed for a reliable value.`);
    }
    const zoned = used.filter((c) => c.zoning);
    if (zoning && zoned.length && !zoned.some((c) => c.zoning!.toUpperCase() === String(zoning).toUpperCase())) {
      risks.push(`None of the comparables share the subject's zoning (${zoning}); values may not transfer.`);
      compScore -= 0.05;
    }
  } else if (acres) {
    missing.push('No comparable vacant-land sales in the county in the last three years. Import recorded sales for the county to value it.');
  }

  const confidence = confidenceLevel(valuation ? compScore - penalty : 0);

  // ----------------------------------------------------- buyer and offer
  const ratio = input.buyerRatio ?? DEFAULT_LAND_BUYER_RATIO;
  let expectedBuyerPrice: number | null = null;
  if (valuation && acres) {
    const fromRatio = valuation.low * ratio;
    const fromBuyers = input.buyerPricePerAcre && input.buyerPricePerAcre > 0 ? input.buyerPricePerAcre * acres : null;
    if (fromBuyers != null) {
      expectedBuyerPrice = roundValue(Math.min(valuation.low, fromBuyers));
      evidence.push({
        kind: 'buyer_demand',
        text: `Matched buyers paid a median ${usd(roundTo(input.buyerPricePerAcre!, 100))}/acre in this county.`,
      });
      assumptions.push('The buyer price is the lower of the conservative value and what matched buyers have paid per acre.');
    } else {
      expectedBuyerPrice = roundValue(fromRatio);
      assumptions.push(
        `A land buyer pays about ${Math.round(ratio * 100)}% of the low end of the value range. This is an assumption; buyers' recorded purchases replace it once matched.`,
      );
    }
  }
  if (costs > 0) assumptions.push(`Costs of ${usd(costs)} (closing, diligence, holding) come out of the fee.`);

  let offerRange: { low: number; high: number } | null = null;
  let expectedNet: number | null = null;
  if (expectedBuyerPrice != null) {
    const high = roundOffer(expectedBuyerPrice - input.targetFee - costs);
    if (high > 0) offerRange = { low: roundOffer(high * 0.8), high };
    const planned = input.contractPrice ?? offerRange?.high ?? null;
    expectedNet = planned != null ? expectedBuyerPrice - planned - costs : null;
  }

  // ------------------------------------------------------------- decision
  let decision: AssetUnderwriting['decision'];
  const contractAbove = input.contractPrice != null && offerRange != null && input.contractPrice > offerRange.high;
  if (acres && valuation && (!offerRange || (contractAbove && expectedNet != null && expectedNet < input.minNetProfit))) {
    decision = 'pass';
  } else if (access && access.value === false) {
    decision = 'pass';
  } else if (!valuation || used.length < LAND_MIN_COMPS || confidence.level === 'low' || !access || access.status !== 'verified') {
    decision = 'review';
  } else if (flood && typeof flood.value === 'string' && isHighRiskFloodZone(flood.value)) {
    decision = 'review';
  } else {
    decision = 'pursue';
  }
  if (input.sellerAsk != null && offerRange && input.sellerAsk > offerRange.high) {
    risks.push(`The seller asks ${usd(input.sellerAsk)}, above the top of the offer range.`);
  }

  // -------------------------------------------------------- explanation
  if (valuation && perAcre && acres) {
    explanation.push(
      `Halo valued the ${round1(acres)} acres from ${used.length} comparable vacant-land sale(s) in ${input.subject.county ?? 'the county'}: ${usd(perAcre.low)} to ${usd(perAcre.high)} per acre, so about ${usd(valuation.low)} to ${usd(valuation.high)}.`,
    );
  } else {
    explanation.push('Halo could not value this parcel yet: ' + (missing[0] ?? 'there is not enough data.'));
  }
  if (expectedBuyerPrice != null) {
    explanation.push(`A land buyer would likely pay around ${usd(expectedBuyerPrice)} for it.`);
  }
  if (offerRange) {
    explanation.push(
      `Offering the seller ${usd(offerRange.low)} to ${usd(offerRange.high)} leaves room for the ${usd(input.targetFee)} fee${costs > 0 ? ` and ${usd(costs)} of costs` : ''}.`,
    );
  } else if (expectedBuyerPrice != null) {
    explanation.push('No offer leaves room for the fee and costs at what a buyer would pay.');
  }
  explanation.push(input.buyerDemand.detail);
  explanation.push(decisionSentence(decision, missing, risks));

  return {
    assetClass: 'land',
    subtype: input.subject.subtype,
    strategy: 'land_comparables',
    valuation,
    approaches: [
      {
        key: 'land_price_per_acre',
        label: 'Comparable vacant-land sales, price per acre',
        range: valuation,
        unitValue: perAcre,
        unit: perAcre ? 'acre' : null,
        evidenceCount: used.length,
        note: valuation
          ? `Interquartile range of ${used.length} sale(s) within ${LAND_COMP_MAX_AGE_MONTHS} months, same county, ${LAND_COMP_SIZE_BAND}x size band.`
          : acres
            ? 'No usable comparable sales.'
            : 'Acreage unknown.',
      },
    ],
    evidence,
    confidence,
    missing,
    risks,
    assumptions,
    offerRange,
    targetFee: input.targetFee,
    expectedBuyerPrice,
    expectedNet: expectedNet != null ? Math.round(expectedNet) : null,
    buyerDemand: input.buyerDemand,
    decision,
    summary: summaryOf(decision, valuation, offerRange, missing, risks),
    explanation,
    sensitivity: null,
  };
}

export function decisionSentence(decision: AssetUnderwriting['decision'], missing: string[], risks: string[]): string {
  if (decision === 'pursue') return 'Recommendation: pursue. The value is supported and no material unknown blocks an offer.';
  if (decision === 'pass') return `Recommendation: pass. ${risks[0] ?? 'No price leaves room for a fee.'}`;
  return `Recommendation: review before offering. ${missing[0] ?? risks[0] ?? 'Confidence is low.'}`;
}

export function summaryOf(
  decision: AssetUnderwriting['decision'],
  valuation: ValueRange | null,
  offer: { low: number; high: number } | null,
  missing: string[],
  risks: string[],
): string {
  const value = valuation ? `Worth about ${usd(valuation.low)}-${usd(valuation.high)}` : 'No supported value yet';
  const offerText = offer ? `; offer ${usd(offer.low)}-${usd(offer.high)}` : '';
  const verdict = decision === 'pursue' ? 'Pursue' : decision === 'pass' ? 'Pass' : 'Review first';
  const reason = decision === 'pursue' ? null : ((decision === 'pass' ? risks[0] : (missing[0] ?? risks[0])) ?? 'low confidence');
  return `${value}${offerText}. ${verdict}${reason ? `: ${reason.replace(/[.\s]+$/, '')}` : ''}.`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
