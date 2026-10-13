import {
  DEFAULT_ASSIGNMENT_FEE,
  assignmentFeeFor,
  buyerAskingPrice,
} from './buyer-price';

describe('buyerAskingPrice', () => {
  it('adds the fee to the offer made to the seller, never shows the offer itself', () => {
    expect(buyerAskingPrice({ offerAmount: 72000, mao: 78400 })).toEqual({
      price: 82000,
      basis: 'offer',
      sellerPrice: 72000,
      fee: DEFAULT_ASSIGNMENT_FEE,
    });
  });

  it('lets a price a person set win over everything else', () => {
    expect(
      buyerAskingPrice({
        assignmentPrice: 89500,
        contractPrice: 70000,
        offerAmount: 72000,
      }),
    ).toEqual({
      price: 89500,
      basis: 'asking_price',
      sellerPrice: null,
      fee: null,
    });
  });

  it('prefers the signed contract price to the offer, with the deal fee over the tenant fee', () => {
    expect(
      buyerAskingPrice(
        { contractPrice: 70000, assignmentFee: 15000, offerAmount: 72000 },
        12000,
      ),
    ).toMatchObject({ price: 85000, basis: 'contract_price', fee: 15000 });
    expect(buyerAskingPrice({ contractPrice: 70000 }, 12000)).toMatchObject({
      price: 82000,
      fee: 12000,
    });
  });

  it('falls back to the MAO plus the fee, then to 70% of ARV less repairs', () => {
    expect(buyerAskingPrice({ mao: 78400, arv: 172000 })).toMatchObject({
      price: 88400,
      basis: 'mao',
    });
    expect(buyerAskingPrice({ arv: 172000, repairEstimate: 32000 })).toEqual({
      price: 88400,
      basis: 'arv',
      sellerPrice: null,
      fee: null,
    });
    expect(buyerAskingPrice({ arv: 200000 })).toMatchObject({ price: 140000 });
  });

  it('skips seller figures that are missing, zero or negative', () => {
    expect(
      buyerAskingPrice({
        offerAmount: 0,
        mao: -14500,
        arv: 120000,
        repairEstimate: 90000,
      }),
    ).toBeNull();
    expect(buyerAskingPrice({})).toBeNull();
  });

  it('accepts a fee of zero but not a negative one', () => {
    expect(assignmentFeeFor(0, 12000)).toBe(0);
    expect(assignmentFeeFor(-5, 12000)).toBe(12000);
    expect(assignmentFeeFor(null, null)).toBe(DEFAULT_ASSIGNMENT_FEE);
  });
});
