import {
  isAppliedUnderwritingResult,
  markUnderwritingResultUnapplied,
  shouldApplyUnderwritingResult,
} from './stale-result';

describe('underwriting stale result helpers', () => {
  it('treats results as stale when the deal changed after enqueue', () => {
    expect(
      shouldApplyUnderwritingResult({
        runCreatedAt: new Date('2026-08-03T10:00:00.000Z'),
        dealUpdatedAt: new Date('2026-08-03T10:00:01.000Z'),
      }),
    ).toEqual({
      applied: false,
      reason: 'deal_modified_after_enqueue',
    });
  });

  it('allows results when the deal has not changed since enqueue', () => {
    expect(
      shouldApplyUnderwritingResult({
        runCreatedAt: new Date('2026-08-03T10:00:00.000Z'),
        dealUpdatedAt: new Date('2026-08-03T10:00:00.000Z'),
      }),
    ).toEqual({ applied: true });
  });

  it('marks unapplied results so read paths can ignore them', () => {
    const result = markUnderwritingResultUnapplied(
      { arv: 250000, repairEstimate: 35000, mao: 140000 },
      'deal_modified_after_enqueue',
    );

    expect(result).toEqual({
      arv: 250000,
      repairEstimate: 35000,
      mao: 140000,
      applied: false,
      staleReason: 'deal_modified_after_enqueue',
    });
    expect(isAppliedUnderwritingResult(result)).toBe(false);
    expect(isAppliedUnderwritingResult({ arv: 260000 })).toBe(true);
  });
});
