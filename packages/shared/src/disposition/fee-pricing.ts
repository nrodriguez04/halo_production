/**
 * The assignment fee, priced from the deal's numbers and the demand Halo has
 * actually seen. Deterministic and explained line by line: a language model
 * never sets a price. The output is a recommendation; a person approves any
 * price change, counter or acceptance.
 *
 * Vocabulary:
 * - contract price: what we pay the seller under the purchase agreement.
 * - buyer price: what the assignee pays in total (contract price + fee).
 * - fee: buyer price - contract price, before our costs.
 * - net: fee - our transaction costs. Minimum and target profit are net.
 */

export type DemandLevel = 'none' | 'low' | 'moderate' | 'strong';

export interface PricingOffer {
  id: string;
  /** The buyer's total price for the assignment. */
  amount: number;
  kind: 'indication' | 'written_offer';
  /** Only open offers (received / countered) are priced against. */
  open: boolean;
  /** The buyer's proof of funds is verified and covers the amount. */
  fundsVerified: boolean;
}

export interface PricingInput {
  contractPrice: number;
  arv: number | null;
  repairEstimate: number | null;
  /** Our costs paid out of the fee (closing costs we bear, marketing, ...). */
  transactionCosts: number;
  minNetProfit: number;
  targetNetProfit: number;
  /** Share of ARV an investor pays all-in before repairs; 0.70 by default. */
  investorRatio?: number;
  /** Days left to the seller contract's closing deadline. */
  daysToDeadline: number | null;
  /** The price buyers are being asked now, if one is set. */
  currentAskingPrice: number | null;
  offers: PricingOffer[];
  /** Buyers who said they are interested without an offer. */
  interestedCount: number;
  /** Buyers the deal was offered to. */
  contactedCount: number;
}

export type OfferRecommendation = 'accept' | 'counter' | 'reject' | 'hold';

export interface OfferEvaluation {
  offerId: string;
  amount: number;
  impliedFee: number;
  impliedNet: number;
  meetsMinimum: boolean;
  recommendation: OfferRecommendation;
  /** Set when the recommendation is a counter. */
  counterAmount: number | null;
  reasons: string[];
}

export interface PricingRecommendation {
  /** Lowest buyer price that still clears the minimum net profit. */
  floorPrice: number;
  /** Buyer price at the target net profit. */
  targetPrice: number;
  /** What a typical investor can pay (ARV x ratio - repairs), when ARV is known. */
  investorCeiling: number | null;
  /** The buyer price Halo recommends asking now. */
  recommendedPrice: number;
  recommendedFee: number;
  recommendedNet: number;
  demand: DemandLevel;
  /** True when no price clears both the minimum profit and the investor ceiling. */
  spreadInsufficient: boolean;
  /** Recommend changing the current asking price. */
  changeAskingPrice: boolean;
  rationale: string[];
  offers: OfferEvaluation[];
}

const DEFAULT_RATIO = 0.7;
const URGENT_DAYS = 7;
const SOON_DAYS = 14;

/** Prices are quoted to the nearest $500. */
export function roundPrice(n: number): number {
  return Math.round(n / 500) * 500;
}

/** Rounded up, for figures that must not fall below a floor. */
export function ceilPrice(n: number): number {
  return Math.ceil(n / 500) * 500;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function demandLevel(input: {
  offers: PricingOffer[];
  interestedCount: number;
  floorPrice: number;
  targetPrice: number;
}): DemandLevel {
  const open = input.offers.filter((o) => o.open);
  const atFloor = open.filter(
    (o) => o.kind === 'written_offer' && o.amount >= input.floorPrice,
  );
  if (
    atFloor.length >= 2 ||
    atFloor.some((o) => o.amount >= input.targetPrice)
  ) {
    return 'strong';
  }
  if (atFloor.length === 1 || input.interestedCount >= 3) return 'moderate';
  if (open.length > 0 || input.interestedCount > 0) return 'low';
  return 'none';
}

export function recommendAssignmentPricing(
  input: PricingInput,
): PricingRecommendation {
  const rationale: string[] = [];
  const costs = Math.max(0, input.transactionCosts);
  const floorPrice = input.contractPrice + input.minNetProfit + costs;
  const targetPrice =
    input.contractPrice + Math.max(input.targetNetProfit, input.minNetProfit) + costs;
  const ratio = input.investorRatio ?? DEFAULT_RATIO;
  const investorCeiling =
    input.arv != null && input.arv > 0
      ? Math.round(input.arv * ratio - (input.repairEstimate ?? 0))
      : null;

  rationale.push(
    `Floor ${money(floorPrice)}: contract ${money(input.contractPrice)} + minimum net ${money(input.minNetProfit)} + costs ${money(costs)}.`,
  );
  rationale.push(`Target ${money(targetPrice)} at a net of ${money(Math.max(input.targetNetProfit, input.minNetProfit))}.`);
  if (investorCeiling != null) {
    rationale.push(
      `Investor ceiling ${money(investorCeiling)}: ARV ${money(input.arv!)} x ${ratio} - repairs ${money(input.repairEstimate ?? 0)}.`,
    );
  } else {
    rationale.push('No ARV recorded, so no investor ceiling can be checked.');
  }

  const spreadInsufficient =
    investorCeiling != null && investorCeiling < floorPrice;
  if (spreadInsufficient) {
    rationale.push(
      `The investor ceiling is below the floor: at the minimum profit this deal is priced above what a typical investor pays. Renegotiate the contract price or accept a lower fee.`,
    );
  }

  const demand = demandLevel({
    offers: input.offers,
    interestedCount: input.interestedCount,
    floorPrice,
    targetPrice,
  });
  rationale.push(
    `Demand ${demand}: ${input.offers.filter((o) => o.open && o.kind === 'written_offer').length} open written offer(s), ${input.interestedCount} interested, ${input.contactedCount} contacted.`,
  );

  let price = targetPrice;
  if (investorCeiling != null && investorCeiling < price) {
    price = Math.max(floorPrice, investorCeiling);
    rationale.push(`Asking held at the investor ceiling rather than the target.`);
  }

  const openOffers = input.offers.filter((o) => o.open);
  const best = openOffers.reduce<PricingOffer | null>(
    (b, o) => (!b || o.amount > b.amount ? o : b),
    null,
  );
  if (best && best.kind === 'written_offer' && best.amount > price) {
    price = best.amount;
    rationale.push(`The best written offer (${money(best.amount)}) is above the asking price; the market has set it.`);
  }

  const days = input.daysToDeadline;
  if (days != null && days <= URGENT_DAYS && (demand === 'none' || demand === 'low')) {
    const lowered = Math.max(floorPrice, price - (price - floorPrice) / 2);
    if (lowered < price) {
      rationale.push(
        `${days} day(s) to the deadline with ${demand} demand: lower the price halfway to the floor.`,
      );
      price = lowered;
    }
  } else if (days != null && days <= SOON_DAYS && demand === 'none' && input.contactedCount > 0) {
    const lowered = Math.max(floorPrice, price - (price - floorPrice) / 4);
    if (lowered < price) {
      rationale.push(
        `${days} day(s) to the deadline and no response from ${input.contactedCount} buyer(s): lower the price a quarter of the way to the floor.`,
      );
      price = lowered;
    }
  }

  const recommendedPrice = Math.max(roundPrice(price), ceilPrice(floorPrice));
  const recommendedFee = recommendedPrice - input.contractPrice;
  const changeAskingPrice =
    input.currentAskingPrice == null ||
    Math.abs(input.currentAskingPrice - recommendedPrice) >= 500;

  const offers = openOffers.map((o) =>
    evaluateOffer(o, {
      contractPrice: input.contractPrice,
      costs,
      floorPrice,
      askingPrice: recommendedPrice,
      bestAmount: best?.amount ?? null,
      days,
      demand,
    }),
  );

  return {
    floorPrice: ceilPrice(floorPrice),
    targetPrice: roundPrice(targetPrice),
    investorCeiling,
    recommendedPrice,
    recommendedFee,
    recommendedNet: recommendedFee - costs,
    demand,
    spreadInsufficient,
    changeAskingPrice,
    rationale,
    offers,
  };
}

function evaluateOffer(
  o: PricingOffer,
  ctx: {
    contractPrice: number;
    costs: number;
    floorPrice: number;
    askingPrice: number;
    bestAmount: number | null;
    days: number | null;
    demand: DemandLevel;
  },
): OfferEvaluation {
  const impliedFee = o.amount - ctx.contractPrice;
  const impliedNet = impliedFee - ctx.costs;
  const meetsMinimum = o.amount >= ctx.floorPrice;
  const reasons: string[] = [
    `Implied fee ${money(impliedFee)}, net ${money(impliedNet)} after costs.`,
  ];
  const fundsNote = o.fundsVerified
    ? null
    : 'Proof of funds is not verified for this amount: verify it before accepting.';
  const isBest = ctx.bestAmount != null && o.amount >= ctx.bestAmount;
  let recommendation: OfferRecommendation;
  let counterAmount: number | null = null;

  if (o.kind === 'indication') {
    recommendation = 'hold';
    reasons.push('An indication of interest, not a written offer: ask for one in writing.');
  } else if (!meetsMinimum) {
    // Close enough to the floor to be worth a counter; otherwise decline.
    if (o.amount >= ctx.floorPrice * 0.95) {
      recommendation = 'counter';
      counterAmount = ceilPrice(Math.max(ctx.floorPrice, (o.amount + ctx.askingPrice) / 2));
      reasons.push(`Below the floor (${money(ctx.floorPrice)}) but within 5%: counter.`);
    } else {
      recommendation = 'reject';
      reasons.push(`Below the floor (${money(ctx.floorPrice)}) by more than 5%.`);
    }
  } else if (o.amount >= ctx.askingPrice) {
    recommendation = isBest ? 'accept' : 'hold';
    reasons.push(
      isBest
        ? 'At or above the asking price and the best open offer.'
        : 'At or above the asking price, but a better offer is open: keep as backup.',
    );
  } else if (!isBest) {
    recommendation = 'hold';
    reasons.push('Clears the floor but a better offer is open: keep as backup.');
  } else if (
    (ctx.days != null && ctx.days <= SOON_DAYS) ||
    ctx.demand === 'low' ||
    ctx.demand === 'moderate'
  ) {
    recommendation = 'accept';
    reasons.push(
      ctx.days != null && ctx.days <= SOON_DAYS
        ? `Best open offer, clears the floor, and only ${ctx.days} day(s) remain.`
        : `Best open offer and clears the floor with ${ctx.demand} demand.`,
    );
  } else {
    recommendation = 'counter';
    counterAmount = ceilPrice((o.amount + ctx.askingPrice) / 2);
    reasons.push('Best open offer with time and demand to spare: counter between it and the asking price.');
  }
  if (fundsNote && (recommendation === 'accept' || recommendation === 'counter')) {
    reasons.push(fundsNote);
  }
  return {
    offerId: o.id,
    amount: o.amount,
    impliedFee,
    impliedNet,
    meetsMinimum,
    recommendation,
    counterAmount,
    reasons,
  };
}
