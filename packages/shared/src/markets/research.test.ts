import { MarketPolicyContentSchema } from './policy';
import { JurisdictionResearchSchema, draftFromResearch } from './research';

/** SYNTHETIC research for a fictional set of rules; not a statement about any state's law. */
const raw = {
  code: 'ZZ',
  name: 'SYNTHETIC',
  researchedAt: '2026-10-22',
  summary: 'SYNTHETIC summary.',
  proposedClassification: 'B',
  classificationRationale: 'SYNTHETIC rationale.',
  regulator: { name: 'SYNTHETIC Commission', url: 'https://example.org/commission' },
  findings: {
    principal_assignment_without_license: { answer: 'yes', note: 'SYNTHETIC', sourceIds: ['s1'] },
    wholesaler_registration_required: { answer: 'no', note: '', sourceIds: [] },
    license_required_for_activity: { answer: 'conditional', note: 'More than one deal a year', sourceIds: ['s1', 'missing'] },
    disclosures_required: {
      answer: 'yes',
      note: '',
      sourceIds: ['s1'],
      items: [
        { audience: 'buyer', description: 'Notice that only a contract interest is offered', timing: 'before the buyer signs' },
        { audience: 'seller', description: 'Notice of intent to assign', timing: 'at contract' },
      ],
    },
    public_marketing_permitted: { answer: 'no', note: '', sourceIds: [] },
    direct_investor_outreach_permitted: { answer: 'yes', note: '', sourceIds: [] },
    double_closing_permitted: { answer: 'maybe', note: 'not a valid answer', sourceIds: [] },
    seller_cancellation_right: { answer: 'yes', note: '', sourceIds: ['s1'], deadline: { days: 3, businessDays: true, trigger: 'after signing' } },
    out_of_state_entity_requirements: { answer: 'yes', note: '', sourceIds: ['s2'] },
  },
  sources: [
    { id: 's1', citation: 'SYNTHETIC Code 1', title: 'SYNTHETIC', url: 'https://example.org/code-1', type: 'statute', effectiveDate: '2025-01-01', summary: '' },
    { id: 's2', citation: 'SYNTHETIC SoS', url: 'not a url', type: 'blog', effectiveDate: 'January 2025', summary: '' },
  ],
  confidence: 'medium',
};

describe('research import', () => {
  const research = JurisdictionResearchSchema.parse(raw);
  const { content, classification } = draftFromResearch(research);

  it('produces a valid draft policy', () => {
    expect(() => MarketPolicyContentSchema.parse(content)).not.toThrow();
    expect(classification).toBe('B');
    expect(content.summary).toContain('Not reviewed by counsel');
  });

  it('keeps uncertainty: invalid and missing answers stay unknown', () => {
    expect(content.answers.double_closing_permitted.answer).toBe('unknown');
    expect(content.answers.assignment_restrictions.answer).toBe('unknown');
    expect(content.structures.double_close.permission).toBe('unknown');
    expect(content.structures.licensed_brokerage.permission).toBe('unknown');
  });

  it('maps answers onto structures and channels, with SMS always conditional on consent', () => {
    expect(content.structures.assignment.permission).toBe('allowed');
    expect(content.channels.public_listing.permission).toBe('prohibited');
    expect(content.channels.investor_email.permission).toBe('allowed');
    expect(content.channels.investor_sms.permission).toBe('conditional');
  });

  it('encodes disclosures, the cancellation window and requirements', () => {
    expect(content.disclosures.map((d) => [d.key, d.audience, d.timing])).toEqual([
      ['zz_buyer_disclosure_1', 'buyer', 'before_buyer_signs'],
      ['zz_seller_disclosure_2', 'seller', 'before_seller_signs'],
    ]);
    expect(content.deadlines[0]).toMatchObject({ days: 3, businessDays: true, effect: 'seller_may_cancel', blocksMarketing: true });
    expect(content.requirements.map((r) => r.kind)).toEqual(['real_estate_license', 'entity_registration']);
  });

  it('drops citations it cannot stand behind', () => {
    expect(content.answers.license_required_for_activity.sourceIds).toEqual(['s1']);
    const s2 = content.sources.find((s) => s.id === 's2')!;
    expect(s2.url).toBeNull();
    expect(s2.type).toBe('secondary');
    expect(s2.effectiveDate).toBeNull();
  });
});
