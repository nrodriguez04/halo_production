import { factValue, isHighRiskFloodZone, numericFact, weakerStatus, type FactRecord, type FactStatus } from './facts';
import { decisionSentence, summaryOf } from './land-underwriting';
import type { CommercialSubtype } from './taxonomy';
import {
  confidenceLevel,
  quantile,
  roundOffer,
  roundRange,
  roundValue,
  usd,
  type AssetUnderwriting,
  type BuyerDemand,
  type SensitivityCell,
  type UnderwritingEvidence,
  type ValuationApproach,
  type ValueRange,
} from './underwriting-types';

/**
 * Commercial underwriting (docs/asset-classes.md s5.3). Two approaches,
 * each used only when its inputs are real:
 *
 * - income capitalization: NOI / cap rate. NOI comes from the seller's
 *   operating statements (reported) or statements a person checked
 *   (verified), or is derived from income and expenses that are both on
 *   file. Halo never assumes an expense ratio, an occupancy or a rent, and
 *   has no default cap rate: the rate must name its source.
 * - sales comparison: price per square foot, or per unit for multifamily,
 *   from recorded sales of the same kind of property in the county.
 *
 * With neither, there is no value, and the result says which documents to
 * request. A precise number from invented inputs is worse than none.
 */

export interface CommercialComparable {
  ref: string;
  saleDate: string;
  price: number;
  subtype: CommercialSubtype | null;
  buildingSqft: number | null;
  units: number | null;
  county: string | null;
  quality?: string;
}

export interface CapRateInput {
  /** As a fraction: 0.075 for 7.5%. */
  rate: number;
  /** Where it came from, in words ("broker survey Q3 2026", "three comparable sales"). */
  source: string;
}

export interface CommercialUnderwritingInput {
  subject: {
    subtype: CommercialSubtype | null;
    county: string | null;
    buildingSqft: number | null;
    units: number | null;
  };
  facts: readonly FactRecord[];
  /** A sourced market cap rate; the `cap_rate` fact is used when this is absent. */
  capRate?: CapRateInput | null;
  comps: readonly CommercialComparable[];
  asOf: Date;
  targetFee: number;
  transactionCosts: number;
  minNetProfit: number;
  /** A buyer's stated minimum yield (cap rate on the price they pay), when one is known. */
  investorYieldMin?: number | null;
  contractPrice?: number | null;
  sellerAsk?: number | null;
  buyerDemand: BuyerDemand;
}

export const COMMERCIAL_COMP_MAX_AGE_MONTHS = 36;
export const COMMERCIAL_MIN_COMPS = 3;
const MONTH_MS = 30.44 * 86_400_000;

/** NOI as the record supports it: stated, or income less expenses when both are on file. */
export function resolveNoi(facts: readonly FactRecord[]): { value: number; status: FactStatus; derived: boolean } | null {
  const noi = numericFact(facts, 'noi');
  if (noi) return { ...noi, derived: false };
  const income = numericFact(facts, 'gross_operating_income');
  const expenses = numericFact(facts, 'operating_expenses');
  if (income && expenses) {
    return { value: income.value - expenses.value, status: weakerStatus(income.status, expenses.status), derived: true };
  }
  return null;
}

export function underwriteCommercial(input: CommercialUnderwritingInput): AssetUnderwriting {
  const evidence: UnderwritingEvidence[] = [];
  const missing: string[] = [];
  const risks: string[] = [];
  const assumptions: string[] = [];
  const explanation: string[] = [];
  const approaches: ValuationApproach[] = [];
  const costs = Math.max(0, input.transactionCosts);
  let score = 0;
  let penalty = 0;

  // ------------------------------------------------------- income approach
  const noi = resolveNoi(input.facts);
  const income = numericFact(input.facts, 'gross_operating_income');
  const expenses = numericFact(input.facts, 'operating_expenses');
  const capFact = numericFact(input.facts, 'cap_rate');
  const capSourceFact = factValue(input.facts, 'cap_rate');
  const cap: CapRateInput | null =
    input.capRate && input.capRate.rate > 0 && input.capRate.source.trim()
      ? input.capRate
      : capFact && capFact.value > 0
        ? { rate: capFact.value > 1 ? capFact.value / 100 : capFact.value, source: capSourceFact?.source ?? 'the cap rate on file' }
        : null;

  if (!noi) {
    if (income && !expenses) {
      missing.push('Operating expenses are not on file. Request the trailing-12-month operating statement (T12); Halo does not assume an expense ratio.');
    } else if (!income && expenses) {
      missing.push('Income is not on file. Request the T12 and a current rent roll.');
    } else {
      missing.push('No net operating income on file. Request the T12 operating statement and a current rent roll from the seller.');
    }
  } else {
    evidence.push({
      kind: 'fact',
      text: `NOI ${usd(noi.value)}/yr${noi.derived ? ' (income less expenses)' : ''}, ${noi.status === 'verified' ? 'verified against statements' : noi.status === 'reported' ? 'as reported by the seller, not yet verified' : noi.status}`,
    });
    if (noi.status !== 'verified') {
      missing.push('NOI is not verified: check it against the T12 and rent roll before relying on the income value.');
      penalty += noi.status === 'reported' ? 0.1 : 0.25;
    }
    if (noi.value <= 0) risks.push('Expenses exceed income: the property loses money as operated.');
  }
  if (!cap) {
    missing.push('No sourced market cap rate. Enter one with its source (comparable sales or a broker survey); Halo has no default.');
  } else {
    evidence.push({ kind: 'assumption', text: `Cap rate ${pct(cap.rate)} from ${cap.source}.` });
  }

  let incomeRange: ValueRange | null = null;
  let sensitivity: SensitivityCell[] | null = null;
  if (noi && noi.value > 0 && cap) {
    const mid = noi.value / cap.rate;
    const low = noi.value / (cap.rate + 0.005);
    const high = noi.value / Math.max(0.01, cap.rate - 0.005);
    incomeRange = roundRange({ low, mid, high });
    score = Math.max(score, noi.status === 'verified' ? 0.8 : 0.65);
    if (noi.status === 'verified' || noi.status === 'reported') {
      sensitivity = [];
      for (const dCap of [-0.01, -0.005, 0, 0.005, 0.01]) {
        for (const dNoi of [-0.1, -0.05, 0]) {
          const rate = cap.rate + dCap;
          if (rate <= 0.01) continue;
          sensitivity.push({
            capRate: Math.round(rate * 10000) / 10000,
            noiChange: dNoi,
            value: roundValue((noi.value * (1 + dNoi)) / rate),
          });
        }
      }
    }
  }
  approaches.push({
    key: 'income_capitalization',
    label: 'Income capitalization (NOI / cap rate)',
    range: incomeRange,
    unitValue: null,
    unit: null,
    evidenceCount: noi && cap ? 1 : 0,
    note: incomeRange
      ? `NOI ${usd(noi!.value)} at ${pct(cap!.rate)} cap, plus or minus half a point.`
      : !noi
        ? 'Not applied: no NOI on file.'
        : !cap
          ? 'Not applied: no sourced cap rate.'
          : 'Not applied: NOI is not positive.',
  });

  // -------------------------------------------------------- sales approach
  const perUnit = input.subject.subtype === 'multifamily' && (input.subject.units ?? 0) > 0;
  const size = perUnit ? input.subject.units : input.subject.buildingSqft;
  const county = input.subject.county?.trim().toLowerCase() ?? null;
  const used = input.comps.filter((c) => {
    const age = (input.asOf.getTime() - Date.parse(c.saleDate)) / MONTH_MS;
    const denom = perUnit ? c.units : c.buildingSqft;
    return (
      c.price > 0 &&
      (denom ?? 0) > 0 &&
      age >= 0 &&
      age <= COMMERCIAL_COMP_MAX_AGE_MONTHS &&
      (!county || c.county?.trim().toLowerCase() === county) &&
      (!input.subject.subtype || !c.subtype || c.subtype === input.subject.subtype)
    );
  });
  let salesRange: ValueRange | null = null;
  let unitValue: ValueRange | null = null;
  if (size && size > 0 && used.length > 0) {
    const per = used.map((c) => c.price / (perUnit ? c.units! : c.buildingSqft!)).sort((a, b) => a - b);
    const p25 = quantile(per, 0.25)!;
    const med = quantile(per, 0.5)!;
    const p75 = quantile(per, 0.75)!;
    unitValue = perUnit
      ? { low: roundTo(p25, 1000), mid: roundTo(med, 1000), high: roundTo(p75, 1000) }
      : { low: roundTo(p25, 5), mid: roundTo(med, 5), high: roundTo(p75, 5) };
    salesRange = roundRange({ low: size * p25, mid: size * med, high: size * p75 });
    const s = used.length >= 5 ? 0.65 : used.length >= COMMERCIAL_MIN_COMPS ? 0.55 : 0.35;
    score = Math.max(score, s);
    if (used.length < COMMERCIAL_MIN_COMPS) {
      missing.push(`Only ${used.length} comparable sale(s) of this property type; at least ${COMMERCIAL_MIN_COMPS} are needed.`);
    }
    for (const c of used.slice(0, 6)) {
      const d = perUnit ? c.units! : c.buildingSqft!;
      evidence.push({
        kind: 'comparable_sale',
        ref: c.ref,
        text: `Sold ${c.saleDate} for ${usd(c.price)}: ${usd(c.price / d)} per ${perUnit ? 'unit' : 'sq ft'}${c.quality && c.quality !== 'recorded' ? ` (${c.quality})` : ''}`,
      });
    }
  } else if (!size) {
    missing.push(perUnit ? 'Unit count is not on file.' : 'Building area is not on file.');
  } else {
    missing.push('No comparable sales of this property type in the county in the last three years.');
  }
  approaches.push({
    key: perUnit ? 'sales_price_per_unit' : 'sales_price_per_sqft',
    label: perUnit ? 'Comparable sales, price per unit' : 'Comparable sales, price per square foot',
    range: salesRange,
    unitValue,
    unit: unitValue ? (perUnit ? 'unit' : 'sq ft') : null,
    evidenceCount: used.length,
    note: salesRange ? `Interquartile range of ${used.length} sale(s).` : 'Not applied.',
  });

  // ------------------------------------------------------------ reconcile
  const ranges = [incomeRange, salesRange].filter((r): r is ValueRange => r != null);
  const valuation: ValueRange | null = ranges.length
    ? roundRange({
        low: Math.min(...ranges.map((r) => r.low)),
        mid: ranges.reduce((s, r) => s + r.mid, 0) / ranges.length,
        high: Math.max(...ranges.map((r) => r.high)),
      })
    : null;
  if (incomeRange && salesRange) {
    const gap = Math.abs(incomeRange.mid - salesRange.mid) / Math.max(incomeRange.mid, salesRange.mid);
    if (gap > 0.25) {
      risks.push('The income value and the comparable-sales value differ by more than 25%; one of the inputs may be off.');
      penalty += 0.1;
    } else {
      score += 0.05;
    }
  }

  // ------------------------------------------------------- other facts
  const occupancy = numericFact(input.facts, 'occupancy_rate');
  if (!occupancy) {
    missing.push('Occupancy is not on file; it comes from a current rent roll.');
    penalty += 0.05;
  } else if (occupancy.value < (occupancy.value > 1 ? 85 : 0.85)) {
    risks.push(`Occupancy is ${occupancy.value > 1 ? occupancy.value : Math.round(occupancy.value * 100)}%: income depends on leasing up.`);
  }
  if (!factValue(input.facts, 'rent_roll')) missing.push('Rent roll not on file.');
  const capex = numericFact(input.facts, 'capex_needs');
  if (capex && capex.value > 0) {
    risks.push(`Known capital needs of ${usd(capex.value)} come off what a buyer will pay.`);
  } else {
    missing.push('Capital needs are unknown until a property condition report is done.');
  }
  const env = factValue(input.facts, 'environmental');
  if (!env) missing.push('No environmental review (Phase I) on file.');
  else if (typeof env.value === 'string' && /(recognized|REC|contamina|UST|tank)/i.test(env.value)) {
    risks.push(`Environmental: ${env.value}.`);
    penalty += 0.1;
  }
  const flood = factValue(input.facts, 'flood_zone');
  if (flood && typeof flood.value === 'string' && isHighRiskFloodZone(flood.value)) {
    risks.push(`FEMA flood zone ${flood.value}: high flood risk and required flood insurance.`);
  }

  const confidence = confidenceLevel(valuation ? score - penalty : 0);

  // ---------------------------------------------------- buyer and offer
  let expectedBuyerPrice: number | null = null;
  if (valuation) {
    let price = valuation.low - (capex && capex.value > 0 ? capex.value : 0);
    if (input.investorYieldMin && input.investorYieldMin > 0 && noi && noi.value > 0) {
      const byYield = noi.value / input.investorYieldMin;
      if (byYield < price) {
        price = byYield;
        assumptions.push(`The buyer's ${pct(input.investorYieldMin)} minimum yield caps the price at ${usd(byYield)}.`);
      }
    }
    expectedBuyerPrice = price > 0 ? roundValue(price) : null;
    assumptions.push('A buyer pays at most the low end of the value range, less known capital needs.');
  }
  let offerRange: { low: number; high: number } | null = null;
  let expectedNet: number | null = null;
  if (expectedBuyerPrice != null) {
    const high = roundOffer(expectedBuyerPrice - input.targetFee - costs);
    if (high > 0) offerRange = { low: roundOffer(high * 0.85), high };
    const planned = input.contractPrice ?? offerRange?.high ?? null;
    expectedNet = planned != null ? expectedBuyerPrice - planned - costs : null;
  }

  let decision: AssetUnderwriting['decision'];
  const contractAbove = input.contractPrice != null && offerRange != null && input.contractPrice > offerRange.high;
  if (valuation && (!offerRange || (contractAbove && expectedNet != null && expectedNet < input.minNetProfit))) {
    decision = 'pass';
  } else if (!valuation || !incomeRange || noi?.status !== 'verified' || confidence.level === 'low') {
    decision = 'review';
  } else {
    decision = 'pursue';
  }
  if (input.sellerAsk != null && offerRange && input.sellerAsk > offerRange.high) {
    risks.push(`The seller asks ${usd(input.sellerAsk)}, above the top of the offer range.`);
  }

  if (incomeRange) {
    explanation.push(
      `At ${usd(noi!.value)} a year of net operating income and a ${pct(cap!.rate)} cap rate (${cap!.source}), the property is worth about ${usd(incomeRange.low)} to ${usd(incomeRange.high)}.`,
    );
  }
  if (salesRange && unitValue) {
    explanation.push(
      `${used.length} comparable sale(s) put it at ${usd(unitValue.low)} to ${usd(unitValue.high)} per ${perUnit ? 'unit' : 'square foot'}, about ${usd(salesRange.low)} to ${usd(salesRange.high)}.`,
    );
  }
  if (!valuation) explanation.push(`Halo cannot value this property yet. ${missing[0] ?? ''}`.trim());
  if (expectedBuyerPrice != null) explanation.push(`An investor would likely pay around ${usd(expectedBuyerPrice)}.`);
  if (offerRange) {
    explanation.push(`Offering ${usd(offerRange.low)} to ${usd(offerRange.high)} leaves room for the ${usd(input.targetFee)} fee.`);
  }
  explanation.push(input.buyerDemand.detail);
  explanation.push(decisionSentence(decision, missing, risks));

  return {
    assetClass: 'commercial',
    subtype: input.subject.subtype,
    strategy: 'commercial_income_and_sales',
    valuation,
    approaches,
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
    sensitivity,
  };
}

const pct = (r: number) => `${Math.round(r * 1000) / 10}%`;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;
