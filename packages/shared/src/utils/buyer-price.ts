/**
 * What buyers are asked to pay for an assignment. A wholesale buyer pays the
 * seller-side price plus the wholesaler's fee, so the seller-side figures
 * (the offer made to the seller, the contract price, the MAO) must never be
 * shown to a buyer as the price: that would give the fee away.
 */

/** Used when neither the deal nor the tenant names a fee; the Underwriter's MAO assumes the same. */
export const DEFAULT_ASSIGNMENT_FEE = 10_000;

export type BuyerPriceBasis =
  | 'asking_price'
  | 'contract_price'
  | 'offer'
  | 'mao'
  | 'arv';

export const BUYER_PRICE_BASIS_LABEL: Record<BuyerPriceBasis, string> = {
  asking_price: 'set on the deal',
  contract_price: 'contract price + fee',
  offer: 'offer to the seller + fee',
  mao: 'MAO + fee',
  arv: '70% of ARV - repairs',
};

export interface BuyerPriceInput {
  /** The price a person set for buyers (DealEconomics.assignmentPrice). */
  assignmentPrice?: number | null;
  /** The price in the seller contract (DealEconomics.contractPrice). */
  contractPrice?: number | null;
  /** This deal's fee (DealEconomics.assignmentFee); the tenant default otherwise. */
  assignmentFee?: number | null;
  /** The offer made to the seller (Deal.offerAmount). */
  offerAmount?: number | null;
  /** The most we would pay the seller (Deal.mao). */
  mao?: number | null;
  arv?: number | null;
  repairEstimate?: number | null;
}

export interface BuyerPrice {
  /** What buyers are asked to pay, in whole dollars. */
  price: number;
  basis: BuyerPriceBasis;
  /** The seller-side figure the price was built on, when there was one. */
  sellerPrice: number | null;
  /** The fee added to it, when one was. */
  fee: number | null;
}

const positive = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
const nonNegative = (n: number | null | undefined): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

/** The deal's own fee, else the tenant's, else the platform default. */
export function assignmentFeeFor(
  dealFee?: number | null,
  tenantFee?: number | null,
): number {
  if (nonNegative(dealFee)) return dealFee;
  if (nonNegative(tenantFee)) return tenantFee;
  return DEFAULT_ASSIGNMENT_FEE;
}

/**
 * A person's own asking price wins. Otherwise the contract price, the offer
 * made to the seller or the MAO, in that order, plus the fee. Otherwise the
 * 70% rule (ARV x 0.70 - repairs), which is what the MAO plus the fee comes
 * to. Null when the deal has no numbers to price from.
 */
export function buyerAskingPrice(
  deal: BuyerPriceInput,
  tenantFee?: number | null,
): BuyerPrice | null {
  if (positive(deal.assignmentPrice)) {
    return {
      price: Math.round(deal.assignmentPrice),
      basis: 'asking_price',
      sellerPrice: null,
      fee: null,
    };
  }
  const fee = assignmentFeeFor(deal.assignmentFee, tenantFee);
  const sellerSide: Array<[BuyerPriceBasis, number | null | undefined]> = [
    ['contract_price', deal.contractPrice],
    ['offer', deal.offerAmount],
    ['mao', deal.mao],
  ];
  for (const [basis, value] of sellerSide) {
    if (positive(value)) {
      return {
        price: Math.round(value + fee),
        basis,
        sellerPrice: value,
        fee,
      };
    }
  }
  if (positive(deal.arv)) {
    const repairs = positive(deal.repairEstimate) ? deal.repairEstimate : 0;
    const price = Math.round(deal.arv * 0.7 - repairs);
    if (price > 0) {
      return { price, basis: 'arv', sellerPrice: null, fee: null };
    }
  }
  return null;
}
