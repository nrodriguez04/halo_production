import {
  JURISDICTION_CODES,
  JurisdictionResearchSchema,
  MarketPolicyContentSchema,
  draftFromResearch,
} from '@halo/shared';
import { JURISDICTION_RESEARCH } from '../research-data';

describe('bundled jurisdiction research', () => {
  const records = JURISDICTION_RESEARCH.map((r) =>
    JurisdictionResearchSchema.parse(r),
  );

  it('covers every state and DC exactly once', () => {
    expect(records.map((r) => r.code).sort()).toEqual(
      [...JURISDICTION_CODES].sort(),
    );
  });

  it('converts every record into a valid, unreviewed draft', () => {
    for (const r of records) {
      const { content } = draftFromResearch(r);
      expect(() => MarketPolicyContentSchema.parse(content)).not.toThrow();
      expect(content.summary).toContain('Not reviewed by counsel');
    }
  });

  it('cites a source for every answer it gives', () => {
    for (const r of records) {
      const ids = new Set(r.sources.map((s) => s.id));
      for (const [key, f] of Object.entries(r.findings)) {
        if (f.answer === 'unknown') continue;
        expect({
          code: r.code,
          key,
          cited: f.sourceIds.some((id) => ids.has(id)),
        }).toEqual({ code: r.code, key, cited: true });
      }
    }
  });

  it('keeps the Texas buyer notice on the key the built-in Texas gate uses', () => {
    const tx = draftFromResearch(records.find((r) => r.code === 'TX')!);
    expect(tx.content.disclosures.map((d) => d.key)).toContain(
      'equitable_interest_disclosure',
    );
  });
});
