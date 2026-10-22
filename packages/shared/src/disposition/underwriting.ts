import { roundPrice } from './fee-pricing';

/**
 * Deterministic underwriting. The Deal Underwriter (a model) supplies the
 * judgement calls: the after-repair value, the repairs and how confident it
 * is. Everything that follows from them is arithmetic and lives here: what
 * an investor can pay, the most we may offer the seller, the offer range,
 * the expected profit and the downside scenarios. A model never sets a
 * price.
 */

export const DEFAULT_INVESTOR_RATIO = 0.7;

export interface UnderwritingInput {
  arv: number | null;
  repairEstimate: number | null;
  /** The fee we add for buyers (the deal's, else the tenant's). */
  assignmentFee: number;
  /** Our costs paid out of the fee. */
  transactionCosts: number;
  minNetProfit: number;
  /** The underwriting confidence (0-1), when one is known. */
  confidence: number | null;
  /** Below this the numbers need a person's review. */
  minConfidence: number;
  /** Investors pay at most ARV x this - repairs. */
  investorRatio?: number;
  /** The price in a signed (or proposed) seller contract, if any. */
  contractPrice?: number | null;
  /** What the seller asks, if known. */
  sellerAsk?: number | null;
}

export type UnderwritingRecommendation = 'offer' | 'pass' | 'needs_review';

export interface UnderwritingScenario {
  key: 'base' | 'arv_down_10' | 'repairs_up_25' | 'both';
  label: string;
  arv: number;
  repairs: number;
  /** What an investor pays at most under this scenario. */
  investorMax: number;
  /** Our net at the planned purchase price, if the buyer pays the investor max. */
  net: number | null;
  clearsMinimum: boolean | null;
}

export interface Underwriting {
  investorMax: number | null;
  mao: number | null;
  offerRange: { low: number; high: number } | null;
  /** The price we plan to buy at: the contract price, else the MAO. */
  plannedPurchase: number | null;
  expectedBuyerPrice: number | null;
  expectedFee: number | null;
  expectedNet: number | null;
  scenarios: UnderwritingScenario[];
  flags: string[];
  recommendation: UnderwritingRecommendation;
  rationale: string[];
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function underwriteDeal(input: UnderwritingInput): Underwriting {
  const ratio = input.investorRatio ?? DEFAULT_INVESTOR_RATIO;
  const flags: string[] = [];
  const rationale: string[] = [];
  const costs = Math.max(0, input.transactionCosts);

  if (input.arv == null || !(input.arv > 0)) {
    return {
      investorMax: null,
      mao: null,
      offerRange: null,
      plannedPurchase: input.contractPrice ?? null,
      expectedBuyerPrice: null,
      expectedFee: null,
      expectedNet: null,
      scenarios: [],
      flags: ['no_arv'],
      recommendation: 'needs_review',
      rationale: ['No after-repair value: nothing can be priced until one is estimated.'],
    };
  }
  const arv = input.arv;
  const repairs = input.repairEstimate != null && input.repairEstimate >= 0 ? input.repairEstimate : 0;
  if (input.repairEstimate == null) flags.push('no_repairs');

  const investorMax = Math.round(arv * ratio - repairs);
  const mao = roundPrice(investorMax - input.assignmentFee);
  rationale.push(
    `Investor max ${money(investorMax)}: ARV ${money(arv)} x ${ratio} - repairs ${money(repairs)}${input.repairEstimate == null ? ' (repairs not estimated, taken as $0)' : ''}.`,
  );
  rationale.push(`MAO ${money(mao)}: investor max less our ${money(input.assignmentFee)} fee.`);

  const offerRange =
    mao > 0 ? { low: roundPrice(mao * 0.85), high: mao } : null;
  if (offerRange) {
    rationale.push(`Offer range ${money(offerRange.low)} to ${money(offerRange.high)}: open near 85% of the MAO, walk away above it.`);
  }

  const plannedPurchase = input.contractPrice ?? (mao > 0 ? mao : null);
  const expectedBuyerPrice =
    plannedPurchase != null
      ? Math.min(investorMax, plannedPurchase + input.assignmentFee)
      : null;
  const expectedFee =
    plannedPurchase != null && expectedBuyerPrice != null
      ? expectedBuyerPrice - plannedPurchase
      : null;
  const expectedNet = expectedFee != null ? expectedFee - costs : null;
  if (expectedNet != null && plannedPurchase != null) {
    rationale.push(
      `At ${money(plannedPurchase)}${input.contractPrice != null ? ' (the contract price)' : ' (the MAO)'}, a buyer at ${money(expectedBuyerPrice!)} leaves a fee of ${money(expectedFee!)} and ${money(expectedNet)} net of ${money(costs)} costs.`,
    );
  }

  const scenario = (
    key: UnderwritingScenario['key'],
    label: string,
    a: number,
    r: number,
  ): UnderwritingScenario => {
    const max = Math.round(a * ratio - r);
    const net = plannedPurchase != null ? max - plannedPurchase - costs : null;
    return {
      key,
      label,
      arv: Math.round(a),
      repairs: Math.round(r),
      investorMax: max,
      net,
      clearsMinimum: net != null ? net >= input.minNetProfit : null,
    };
  };
  const scenarios = [
    scenario('base', 'As estimated', arv, repairs),
    scenario('arv_down_10', 'ARV 10% lower', arv * 0.9, repairs),
    scenario('repairs_up_25', 'Repairs 25% higher', arv, repairs * 1.25),
    scenario('both', 'Both', arv * 0.9, repairs * 1.25),
  ];

  if (mao <= 0) flags.push('mao_not_positive');
  if (input.confidence == null) flags.push('no_confidence');
  else if (input.confidence < input.minConfidence) flags.push('low_confidence');
  if (input.contractPrice != null && input.contractPrice > mao) flags.push('contract_above_mao');
  if (input.sellerAsk != null && input.sellerAsk > mao) flags.push('ask_above_mao');
  const worst = scenarios[scenarios.length - 1];
  if (worst.net != null && worst.net < 0) flags.push('downside_loss');
  else if (worst.clearsMinimum === false) flags.push('downside_below_minimum');
  if (expectedNet != null && expectedNet < input.minNetProfit) flags.push('below_minimum_profit');

  let recommendation: UnderwritingRecommendation;
  const overpaying =
    flags.includes('contract_above_mao') &&
    expectedNet != null &&
    expectedNet < input.minNetProfit;
  if (mao <= 0 || overpaying) {
    recommendation = 'pass';
    rationale.push(
      mao <= 0
        ? 'Pass: there is no price that leaves an investor room for repairs and us a fee.'
        : 'Pass at this contract price: it is above the MAO and the profit falls short of the minimum.',
    );
  } else if (flags.some((f) => REVIEW_FLAGS.includes(f))) {
    recommendation = 'needs_review';
    rationale.push(
      `Review before offering: ${flags
        .filter((f) => REVIEW_FLAGS.includes(f))
        .map((f) => FLAG_LABEL[f])
        .join('; ')}.`,
    );
  } else {
    recommendation = 'offer';
  }
  return {
    investorMax,
    mao,
    offerRange,
    plannedPurchase,
    expectedBuyerPrice,
    expectedFee,
    expectedNet,
    scenarios,
    flags,
    recommendation,
    rationale,
  };
}

/**
 * What sends the numbers to a person before an offer: the inputs are
 * missing or not trusted. Downside results are warnings shown with the
 * numbers: at the MAO the combined downside nearly always loses, which is
 * what the MAO's margin is for.
 */
const REVIEW_FLAGS = ['low_confidence', 'no_confidence', 'no_repairs'];

export const FLAG_LABEL: Record<string, string> = {
  no_arv: 'no after-repair value',
  no_repairs: 'repairs not estimated',
  mao_not_positive: 'the MAO is not positive',
  no_confidence: 'no underwriting confidence recorded',
  low_confidence: 'underwriting confidence is low',
  contract_above_mao: 'the contract price is above the MAO',
  ask_above_mao: "the seller's ask is above the MAO",
  downside_loss: 'the downside case loses money',
  downside_below_minimum: 'the downside case falls short of the minimum profit',
  below_minimum_profit: 'the expected profit is below the minimum',
};

