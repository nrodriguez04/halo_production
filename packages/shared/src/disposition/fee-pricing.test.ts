import {
  ceilPrice,
  demandLevel,
  recommendAssignmentPricing,
  roundPrice,
  type PricingInput,
} from './fee-pricing';

function input(over: Partial<PricingInput> = {}): PricingInput {
  return {
    contractPrice: 120_000,
    arv: 260_000,
    repairEstimate: 40_000,
    transactionCosts: 1_000,
    minNetProfit: 5_000,
    targetNetProfit: 15_000,
    daysToDeadline: 30,
    currentAskingPrice: null,
    offers: [],
    interestedCount: 0,
    contactedCount: 0,
    ...over,
  };
}

describe('rounding', () => {
  it('rounds to $500 and rounds floors up', () => {
    expect(roundPrice(126_249)).toBe(126_000);
    expect(roundPrice(126_250)).toBe(126_500);
    expect(ceilPrice(126_001)).toBe(126_500);
  });
});

describe('recommendAssignmentPricing', () => {
  it('asks the target with no demand yet, and explains the floor and ceiling', () => {
    const r = recommendAssignmentPricing(input());
    expect(r.floorPrice).toBe(126_000);
    expect(r.targetPrice).toBe(136_000);
    expect(r.investorCeiling).toBe(142_000);
    expect(r.recommendedPrice).toBe(136_000);
    expect(r.recommendedFee).toBe(16_000);
    expect(r.recommendedNet).toBe(15_000);
    expect(r.demand).toBe('none');
    expect(r.spreadInsufficient).toBe(false);
    expect(r.rationale[0]).toContain('Floor $126,000');
  });

  it('holds the price at the investor ceiling when the target is above it', () => {
    const r = recommendAssignmentPricing(input({ arv: 240_000 }));
    expect(r.investorCeiling).toBe(128_000);
    expect(r.recommendedPrice).toBe(128_000);
  });

  it('flags a spread that cannot clear the minimum profit', () => {
    const r = recommendAssignmentPricing(input({ arv: 220_000 }));
    expect(r.spreadInsufficient).toBe(true);
    expect(r.recommendedPrice).toBe(r.floorPrice);
  });

  it('lowers the price toward the floor near the deadline with little demand', () => {
    const r = recommendAssignmentPricing(input({ daysToDeadline: 5, interestedCount: 1, contactedCount: 20 }));
    expect(r.demand).toBe('low');
    expect(r.recommendedPrice).toBe(131_000);
    expect(r.rationale.join(' ')).toContain('halfway to the floor');
  });

  it('follows the market when the best written offer is above the asking price', () => {
    const r = recommendAssignmentPricing(
      input({ offers: [{ id: 'o1', amount: 140_000, kind: 'written_offer', open: true, fundsVerified: true }] }),
    );
    expect(r.demand).toBe('strong');
    expect(r.recommendedPrice).toBe(140_000);
    expect(r.offers[0]).toMatchObject({ recommendation: 'accept', impliedFee: 20_000, impliedNet: 19_000, meetsMinimum: true });
  });

  it('rejects a lowball and counters an offer just under the floor', () => {
    const r = recommendAssignmentPricing(
      input({
        offers: [
          { id: 'low', amount: 110_000, kind: 'written_offer', open: true, fundsVerified: true },
          { id: 'near', amount: 124_000, kind: 'written_offer', open: true, fundsVerified: true },
        ],
      }),
    );
    const byId = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
    expect(byId.low.recommendation).toBe('reject');
    expect(byId.near.recommendation).toBe('counter');
    expect(byId.near.counterAmount).toBeGreaterThanOrEqual(r.floorPrice);
  });

  it('keeps a lesser offer as backup and asks for writing on an indication', () => {
    const r = recommendAssignmentPricing(
      input({
        offers: [
          { id: 'best', amount: 133_000, kind: 'written_offer', open: true, fundsVerified: true },
          { id: 'second', amount: 129_000, kind: 'written_offer', open: true, fundsVerified: true },
          { id: 'verbal', amount: 135_000, kind: 'indication', open: true, fundsVerified: false },
        ],
      }),
    );
    const byId = Object.fromEntries(r.offers.map((o) => [o.offerId, o]));
    expect(byId.second.recommendation).toBe('hold');
    expect(byId.verbal.recommendation).toBe('hold');
    expect(byId.verbal.reasons.join()).toContain('in writing');
  });

  it('counters the best offer between floor and ask when demand and time allow', () => {
    const r = recommendAssignmentPricing(
      input({
        offers: [
          { id: 'a', amount: 131_000, kind: 'written_offer', open: true, fundsVerified: false },
          { id: 'b', amount: 128_000, kind: 'written_offer', open: true, fundsVerified: true },
        ],
      }),
    );
    expect(r.demand).toBe('strong');
    const a = r.offers.find((o) => o.offerId === 'a')!;
    expect(a.recommendation).toBe('counter');
    expect(a.counterAmount).toBe(133_500);
    expect(a.reasons.join()).toContain('Proof of funds is not verified');
  });

  it('accepts the best offer that clears the floor when the deadline is close', () => {
    const r = recommendAssignmentPricing(
      input({ daysToDeadline: 10, offers: [{ id: 'a', amount: 128_000, kind: 'written_offer', open: true, fundsVerified: true }] }),
    );
    expect(r.offers[0].recommendation).toBe('accept');
  });

  it('ignores closed offers', () => {
    const r = recommendAssignmentPricing(
      input({ offers: [{ id: 'x', amount: 150_000, kind: 'written_offer', open: false, fundsVerified: true }] }),
    );
    expect(r.offers).toEqual([]);
    expect(r.demand).toBe('none');
  });
});

describe('demandLevel', () => {
  it('counts interest without offers as moderate from three buyers', () => {
    expect(demandLevel({ offers: [], interestedCount: 3, floorPrice: 1, targetPrice: 2 })).toBe('moderate');
    expect(demandLevel({ offers: [], interestedCount: 1, floorPrice: 1, targetPrice: 2 })).toBe('low');
  });
});
