import { rankOpportunities, scoreOpportunity, type OpportunityInput } from './opportunity-ranking';

function opp(over: Partial<OpportunityInput> = {}): OpportunityInput {
  return {
    id: 'd1',
    label: 'SYNTHETIC 1 Test St',
    stage: 'negotiating',
    leadScore: 80,
    sellerEngaged: true,
    underwriting: { recommendation: 'offer', expectedNet: 15_000, flags: [] },
    demand: { contactable: 5, strong: 3 },
    daysSinceActivity: 1,
    risk: { titleIssues: 0, noSellerContact: false },
    ...over,
  };
}

describe('opportunity ranking', () => {
  it('scores a motivated seller, a fat margin, real demand and fresh activity highest', () => {
    const r = scoreOpportunity(opp(), 5_000);
    expect(r.components).toEqual({ acquisition: 25, margin: 30, demand: 20, velocity: 10, risk: 0 });
    expect(r.score).toBe(85);
    expect(r.reasons).toEqual(
      expect.arrayContaining(['Lead score 80', 'Seller is replying', 'Expected net $15,000', '3 strong / 5 contactable buyer fit(s)']),
    );
  });

  it('gives no margin to a pass or an un-underwritten deal and says so', () => {
    expect(scoreOpportunity(opp({ underwriting: { recommendation: 'pass', expectedNet: -2000, flags: [] } }), 5_000).components.margin).toBe(0);
    const none = scoreOpportunity(opp({ underwriting: null }), 5_000);
    expect(none.components.margin).toBe(0);
    expect(none.reasons).toContain('Not underwritten yet');
  });

  it('takes points off for title issues, untrusted numbers and no seller contact', () => {
    const r = scoreOpportunity(
      opp({
        underwriting: { recommendation: 'needs_review', expectedNet: 15_000, flags: ['low_confidence'] },
        risk: { titleIssues: 1, noSellerContact: true },
      }),
      5_000,
    );
    expect(r.components.risk).toBe(-20);
    expect(r.reasons).toEqual(expect.arrayContaining(['Numbers need review', '1 open title issue(s)', 'No way to reach the seller']));
  });

  it('marks down a tax-sale deal until its interest is verified', () => {
    const r = scoreOpportunity(opp({ risk: { titleIssues: 0, noSellerContact: false, taxSaleUnverified: true } }), 5_000);
    expect(r.components.risk).toBe(-8);
    expect(r.reasons).toContain('Tax sale: interest not verified');
  });

  it('never invents demand: no contactable buyer scores no demand points', () => {
    expect(scoreOpportunity(opp({ demand: { contactable: 0, strong: 0 } }), 5_000).components.demand).toBe(0);
  });

  it('ranks best first with a stable order', () => {
    const ranked = rankOpportunities(
      [
        opp({ id: 'a', label: 'B', leadScore: 20, daysSinceActivity: 30 }),
        opp({ id: 'b', label: 'A' }),
        opp({ id: 'c', label: 'C' }),
      ],
      5_000,
    );
    expect(ranked.map((r) => r.id)).toEqual(['b', 'c', 'a']);
  });
});
