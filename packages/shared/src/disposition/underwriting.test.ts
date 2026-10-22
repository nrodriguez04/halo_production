import { underwriteDeal, type UnderwritingInput } from './underwriting';

function input(over: Partial<UnderwritingInput> = {}): UnderwritingInput {
  return {
    arv: 260_000,
    repairEstimate: 40_000,
    assignmentFee: 10_000,
    transactionCosts: 1_000,
    minNetProfit: 5_000,
    confidence: 0.8,
    minConfidence: 0.5,
    ...over,
  };
}

describe('underwriteDeal', () => {
  it('computes investor max, MAO, offer range and the expected profit at the MAO', () => {
    const u = underwriteDeal(input());
    expect(u.investorMax).toBe(142_000);
    expect(u.mao).toBe(132_000);
    expect(u.offerRange).toEqual({ low: 112_000, high: 132_000 });
    expect(u.plannedPurchase).toBe(132_000);
    expect(u.expectedBuyerPrice).toBe(142_000);
    expect(u.expectedFee).toBe(10_000);
    expect(u.expectedNet).toBe(9_000);
    expect(u.recommendation).toBe('offer');
    // At the MAO the combined downside loses money: shown, not blocking.
    expect(u.flags).toContain('downside_loss');
  });

  it('runs downside scenarios at the planned price and flags a loss', () => {
    const u = underwriteDeal(input({ contractPrice: 125_000 }));
    const byKey = Object.fromEntries(u.scenarios.map((s) => [s.key, s]));
    expect(byKey.base.investorMax).toBe(142_000);
    expect(byKey.arv_down_10.investorMax).toBe(123_800);
    expect(byKey.repairs_up_25.investorMax).toBe(132_000);
    expect(byKey.both.investorMax).toBe(113_800);
    expect(byKey.base.net).toBe(16_000);
    expect(byKey.both.net).toBe(-12_200);
    expect(u.flags).toContain('downside_loss');
    expect(u.recommendation).toBe('offer');
  });

  it('uses the contract price once there is one, capped at what an investor can pay', () => {
    const u = underwriteDeal(input({ contractPrice: 120_000, arv: 300_000 }));
    expect(u.plannedPurchase).toBe(120_000);
    expect(u.expectedBuyerPrice).toBe(130_000);
    expect(u.expectedNet).toBe(9_000);
  });

  it('passes when nothing is left for the investor and us', () => {
    const u = underwriteDeal(input({ arv: 100_000, repairEstimate: 70_000 }));
    expect(u.mao).toBeLessThanOrEqual(0);
    expect(u.offerRange).toBeNull();
    expect(u.recommendation).toBe('pass');
  });

  it('passes a contract above the MAO that misses the minimum profit', () => {
    const u = underwriteDeal(input({ contractPrice: 140_000 }));
    expect(u.flags).toEqual(expect.arrayContaining(['contract_above_mao', 'below_minimum_profit']));
    expect(u.recommendation).toBe('pass');
  });

  it('asks for review on low confidence, missing repairs or no ARV', () => {
    expect(underwriteDeal(input({ confidence: 0.3 })).recommendation).toBe('needs_review');
    expect(underwriteDeal(input({ confidence: null })).flags).toContain('no_confidence');
    const noRepairs = underwriteDeal(input({ repairEstimate: null }));
    expect(noRepairs.flags).toContain('no_repairs');
    expect(noRepairs.recommendation).toBe('needs_review');
    const noArv = underwriteDeal(input({ arv: null }));
    expect(noArv).toMatchObject({ mao: null, recommendation: 'needs_review', flags: ['no_arv'] });
  });

  it("flags a seller's ask above the MAO", () => {
    expect(underwriteDeal(input({ sellerAsk: 150_000 })).flags).toContain('ask_above_mao');
  });
});
