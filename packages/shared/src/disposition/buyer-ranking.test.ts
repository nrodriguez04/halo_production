import {
  buyBoxFromPreferences,
  matchBuyerToDeal,
  matchExplanation,
  rankBuyersForDeal,
  type RankingBuyer,
  type RankingDeal,
} from './buyer-ranking';

const NOW = new Date('2026-10-21T12:00:00Z');
const monthsAgo = (n: number) => new Date(NOW.getTime() - n * 30 * 86_400_000);

const deal: RankingDeal = {
  city: 'Atlanta',
  state: 'GA',
  zip: '30310',
  propertyType: 'single_family',
  buyerPrice: 150_000,
  arv: 260_000,
  repairEstimate: 40_000,
};

function buyer(over: Partial<RankingBuyer> = {}): RankingBuyer {
  return {
    id: 'b1',
    name: 'Synthetic Buyer',
    status: 'active',
    hasEmail: true,
    hasPhone: false,
    emailConsent: true,
    smsConsent: false,
    optedOut: false,
    buyBox: buyBoxFromPreferences({}),
    fundingType: 'cash',
    pof: { status: 'none', amount: null, expiresAt: null },
    transactions: [],
    engagement: { sent: 0, replies: 0, interested: 0 },
    outcomes: { offers: 0, accepted: 0, closed: 0, fellThrough: 0 },
    ...over,
  };
}

describe('buyBoxFromPreferences', () => {
  it('reads the legacy preferences shape and ignores junk', () => {
    expect(
      buyBoxFromPreferences({
        locations: ['Atlanta', ' GA ', ''],
        priceRange: { min: 100000, max: null },
        propertyTypes: ['single_family'],
        maxRepairEstimate: '50000',
        minARV: 'abc',
      }),
    ).toEqual({
      locations: ['Atlanta', 'GA'],
      propertyTypes: ['single_family'],
      priceMin: 100000,
      priceMax: null,
      maxRepairs: 50000,
      minArv: null,
    });
    expect(buyBoxFromPreferences(null).locations).toEqual([]);
  });
});

describe('matchBuyerToDeal', () => {
  it('scores a buyer who verifiably bought nearby and proved funds above one who only stated a box', () => {
    const proven = matchBuyerToDeal(
      deal,
      buyer({
        transactions: [
          { city: 'Atlanta', state: 'GA', zip: '30310', propertyType: 'single_family', price: 140_000, closedAt: monthsAgo(4), source: 'public_record' },
          { city: 'Atlanta', state: 'GA', zip: '30310', propertyType: 'single_family', price: 165_000, closedAt: monthsAgo(9), source: 'public_record' },
        ],
        pof: { status: 'verified', amount: 200_000, expiresAt: null },
      }),
      NOW,
    );
    const stated = matchBuyerToDeal(
      deal,
      buyer({ buyBox: buyBoxFromPreferences({ locations: ['GA'], priceRange: { min: 100000, max: 200000 } }) }),
      NOW,
    );
    expect(proven.score).toBeGreaterThan(stated.score);
    expect(proven.components.trackRecord).toBe(15);
    expect(proven.components.funding).toBe(15);
    expect(proven.historicalRange).toEqual({ min: 140_000, max: 165_000, count: 2 });
    expect(proven.evidence.map((e) => e.kind)).toEqual(
      expect.arrayContaining(['historical_purchase', 'verified_pof', 'inferred_capacity']),
    );
  });

  it('labels buyer-reported purchases as unverified and weighs them half', () => {
    const m = matchBuyerToDeal(
      deal,
      buyer({
        transactions: [
          { city: 'Atlanta', state: 'GA', zip: '30310', propertyType: null, price: 150_000, closedAt: monthsAgo(3), source: 'buyer_provided' },
        ],
      }),
      NOW,
    );
    expect(m.components.trackRecord).toBe(7);
    expect(m.evidence.find((e) => e.kind === 'historical_purchase')?.text).toContain('not verified');
  });

  it('never presents capacity as demand: no interest or offer evidence without replies', () => {
    const m = matchBuyerToDeal(deal, buyer({ buyBox: buyBoxFromPreferences({ priceRange: { min: 0, max: 900000 } }) }), NOW);
    expect(m.evidence.some((e) => e.kind === 'expressed_interest' || e.kind === 'offer')).toBe(false);
    expect(m.evidence.find((e) => e.kind === 'inferred_capacity')?.text).toContain('not a commitment');
  });

  it('flags mismatches with the stated buy box', () => {
    const m = matchBuyerToDeal(
      deal,
      buyer({
        buyBox: buyBoxFromPreferences({
          locations: ['Savannah'],
          priceRange: { min: 300000, max: 500000 },
          propertyTypes: ['multi_family'],
          maxRepairEstimate: 10000,
        }),
      }),
      NOW,
    );
    expect(m.mismatches).toHaveLength(4);
    expect(m.components.location + m.components.price + m.components.propertyType + m.components.condition).toBe(0);
  });

  it.each([
    [{ status: 'inactive' as const }, 'buyer is inactive'],
    [{ status: 'do_not_market' as const }, 'marked do not market'],
    [{ optedOut: true }, 'opted out'],
    [{ hasEmail: false }, 'no email or phone'],
    [{ emailConsent: false }, 'no consent on file'],
  ])('excludes an unqualified buyer (%o)', (over, reason) => {
    const m = matchBuyerToDeal(deal, buyer(over), NOW);
    expect(m.contactable).toBe(false);
    expect(m.excludedReasons.join(' ')).toContain(reason);
    expect(matchExplanation(m)).toMatch(/^Cannot be offered this deal/);
  });

  it('penalizes a buyer who walked away from accepted deals and rewards one who closed', () => {
    const walked = matchBuyerToDeal(deal, buyer({ outcomes: { offers: 2, accepted: 2, closed: 0, fellThrough: 2 } }), NOW);
    const closer = matchBuyerToDeal(deal, buyer({ outcomes: { offers: 2, accepted: 2, closed: 2, fellThrough: 0 } }), NOW);
    expect(walked.components.reliability).toBeLessThan(0);
    expect(closer.components.reliability).toBeGreaterThan(0);
    expect(walked.mismatches.join()).toContain('walked away');
  });

  it('caps the price score when the price is far above anything the buyer has shown', () => {
    const m = matchBuyerToDeal(
      deal,
      buyer({
        transactions: [{ city: 'Macon', state: 'GA', zip: null, propertyType: null, price: 60_000, closedAt: monthsAgo(2), source: 'public_record' }],
      }),
      NOW,
    );
    expect(m.components.price).toBeLessThanOrEqual(4);
    expect(m.mismatches.join()).toContain('well above');
  });
});

describe('rankBuyersForDeal', () => {
  it('puts contactable buyers first, then by score, then by name', () => {
    const ranked = rankBuyersForDeal(
      deal,
      [
        buyer({ id: 'c', name: 'Zed', optedOut: true, buyBox: buyBoxFromPreferences({ locations: ['30310'] }) }),
        buyer({ id: 'a', name: 'Bea' }),
        buyer({ id: 'b', name: 'Abe' }),
        buyer({ id: 'd', name: 'Dee', buyBox: buyBoxFromPreferences({ locations: ['30310'] }) }),
      ],
      NOW,
    );
    expect(ranked.map((r) => r.buyerId)).toEqual(['d', 'b', 'a', 'c']);
  });
});
