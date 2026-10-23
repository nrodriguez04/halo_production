import { channelAllowed, coverageKpis, evaluateMarket, marketAllows, type MarketInput } from './evaluate';
import { emptyPolicyContent, type MarketPolicyContent } from './policy';

const NOW = new Date('2026-10-22T12:00:00Z');

/** A synthetic policy for a fictional market where assignment is permitted with a buyer notice. */
function approvedContent(over: (c: MarketPolicyContent) => void = () => {}): MarketPolicyContent {
  const c = emptyPolicyContent();
  c.answers.principal_assignment_without_license = { answer: 'yes', note: 'SYNTHETIC', sourceIds: [] };
  c.answers.wholesaler_registration_required = { answer: 'no', note: '', sourceIds: [] };
  c.answers.license_required_for_activity = { answer: 'no', note: '', sourceIds: [] };
  c.answers.disclosures_required = { answer: 'yes', note: '', sourceIds: [] };
  c.answers.seller_cancellation_right = { answer: 'no', note: '', sourceIds: [] };
  c.answers.out_of_state_entity_requirements = { answer: 'yes', note: '', sourceIds: [] };
  c.structures.assignment = { permission: 'allowed', conditions: null };
  c.channels.investor_email = { permission: 'allowed', conditions: null };
  c.channels.buyer_deal_page = { permission: 'allowed', conditions: null };
  c.channels.public_listing = { permission: 'prohibited', conditions: null };
  c.disclosures = [
    { key: 'synthetic_buyer_notice', title: 'Buyer notice', audience: 'buyer', timing: 'before_marketing', templateKind: 'buyer_disclosure', sourceIds: [] },
  ];
  c.requirements = [
    { key: 'foreign_llc', kind: 'entity_registration', label: 'Foreign LLC registration', appliesTo: ['seller_contracting'], sourceIds: [] },
  ];
  over(c);
  return c;
}

function input(over: Partial<MarketInput> = {}): MarketInput {
  return {
    code: 'TX',
    now: NOW,
    requestedStatus: 'ACTIVE',
    draft: approvedContent(),
    draftInReview: false,
    approved: {
      version: 1,
      content: approvedContent(),
      classification: 'B',
      approvedAt: new Date('2026-10-01T00:00:00Z'),
      reviewExpiresAt: new Date('2027-10-01T00:00:00Z'),
      basis: 'counsel',
    },
    authorizations: [{ kind: 'entity_registration', status: 'active', verifiedAt: NOW, expiresAt: null }],
    templates: [
      { kind: 'purchase_agreement', status: 'approved' },
      { kind: 'assignment_agreement', status: 'approved' },
      { kind: 'buyer_disclosure', status: 'approved' },
    ],
    operatorAssigned: true,
    selfTest: { ranAt: new Date('2026-10-20T00:00:00Z'), passed: true, stale: false },
    dataAccess: true,
    researchOnFile: true,
    ...over,
  };
}

describe('market evaluation', () => {
  it('activates a market only when legal, every requirement and a person all agree', () => {
    const e = evaluateMarket(input());
    expect(e.maxStatus).toBe('ACTIVE');
    expect(e.effectiveStatus).toBe('ACTIVE');
    expect(e.structures).toEqual(['assignment']);
    expect(e.channels).toEqual(['investor_email', 'buyer_deal_page']);
    expect(marketAllows(e, 'autonomous_operations').allowed).toBe(true);
    expect(e.coverage).toEqual({ research: true, technical: true, active: true });
  });

  it('never promotes itself: a market a person left in research stays there', () => {
    const e = evaluateMarket(input({ requestedStatus: 'RESEARCH_ONLY' }));
    expect(e.maxStatus).toBe('ACTIVE');
    expect(e.effectiveStatus).toBe('PENDING_REQUIREMENTS');
    expect(marketAllows(e, 'seller_contracting').allowed).toBe(false);
    expect(e.nextStep).toContain('APPROVED_FOR_ACQUISITION');
  });

  it('allows research and nothing else without an approved policy', () => {
    const e = evaluateMarket(input({ approved: null }));
    expect(e.effectiveStatus).toBe('RESEARCH_ONLY');
    expect(e.legal.state).toBe('draft');
    expect(marketAllows(e, 'research').allowed).toBe(true);
    for (const a of ['seller_outreach', 'seller_contracting', 'buyer_marketing', 'assignment'] as const) {
      expect(marketAllows(e, a).allowed).toBe(false);
    }
  });

  it('shows a submitted draft as pending legal review', () => {
    const e = evaluateMarket(input({ approved: null, draftInReview: true }));
    expect(e.effectiveStatus).toBe('PENDING_LEGAL_REVIEW');
    expect(e.nextStep).toBe('Counsel reviews and approves the policy.');
  });

  it('falls back when the legal review lapses', () => {
    const ap = input().approved!;
    const e = evaluateMarket(input({ approved: { ...ap, reviewExpiresAt: new Date('2026-10-01T00:00:00Z') } }));
    expect(e.legal.state).toBe('expired');
    expect(e.effectiveStatus).toBe('PENDING_LEGAL_REVIEW');
    expect(e.missing[0]).toContain('lapsed');
  });

  it("reports the basis, and says an owner's lapsed acceptance needs renewing", () => {
    const ap = input().approved!;
    expect(evaluateMarket(input()).legal.basis).toBe('counsel');
    const owner = evaluateMarket(input({ approved: { ...ap, basis: 'owner_risk_acceptance' } }));
    expect(owner.legal).toMatchObject({ state: 'approved', basis: 'owner_risk_acceptance' });
    expect(owner.effectiveStatus).toBe('ACTIVE');
    const lapsed = evaluateMarket(
      input({ approved: { ...ap, basis: 'owner_risk_acceptance', reviewExpiresAt: new Date('2026-10-01T00:00:00Z') } }),
    );
    expect(lapsed.missing[0]).toContain("owner's risk acceptance lapsed");
    expect(lapsed.nextStep).toBe('The owner accepts the policy again, or counsel approves it.');
    expect(evaluateMarket(input({ approved: null })).legal.basis).toBeNull();
  });

  it('holds acquisition until the purchase template and the entity registration are in place', () => {
    const e = evaluateMarket(input({ templates: [], authorizations: [] }));
    expect(e.effectiveStatus).toBe('PENDING_REQUIREMENTS');
    expect(e.rungs.acquisition.filter((c) => !c.met).map((c) => c.key)).toEqual([
      'template:purchase_agreement',
      'requirement:foreign_llc',
    ]);
  });

  it('treats an expired or unverified authorization as missing', () => {
    expect(
      evaluateMarket(input({ authorizations: [{ kind: 'entity_registration', status: 'active', verifiedAt: null, expiresAt: null }] }))
        .effectiveStatus,
    ).toBe('PENDING_REQUIREMENTS');
    expect(
      evaluateMarket(
        input({ authorizations: [{ kind: 'entity_registration', status: 'active', verifiedAt: NOW, expiresAt: new Date('2026-10-21T00:00:00Z') }] }),
      ).effectiveStatus,
    ).toBe('PENDING_REQUIREMENTS');
  });

  it('stops at acquisition when nothing can dispose of the contract', () => {
    const content = approvedContent((c) => {
      c.structures.assignment = { permission: 'prohibited', conditions: null };
    });
    const e = evaluateMarket(input({ approved: { ...input().approved!, content } }));
    expect(e.effectiveStatus).toBe('APPROVED_FOR_ACQUISITION');
    expect(marketAllows(e, 'seller_contracting').allowed).toBe(true);
    expect(marketAllows(e, 'buyer_marketing').allowed).toBe(false);
  });

  it('uses another permitted structure when assignment is prohibited', () => {
    const content = approvedContent((c) => {
      c.structures.assignment = { permission: 'prohibited', conditions: null };
      c.structures.double_close = { permission: 'conditional', conditions: 'SYNTHETIC: separate funding for each leg' };
    });
    const e = evaluateMarket(input({ approved: { ...input().approved!, content } }));
    expect(e.structures).toEqual(['double_close']);
    expect(marketAllows(e, 'assignment').allowed).toBe(false);
    expect(marketAllows(e, 'double_close').allowed).toBe(true);
  });

  it('stops short of active without an operator and a fresh self-test', () => {
    const e = evaluateMarket(input({ operatorAssigned: false, selfTest: { ranAt: new Date('2026-08-01T00:00:00Z'), passed: true, stale: false } }));
    expect(e.effectiveStatus).toBe('APPROVED_FOR_DISPOSITION');
    expect(marketAllows(e, 'autonomous_operations').allowed).toBe(false);
    expect(marketAllows(e, 'buyer_marketing').allowed).toBe(true);
    expect(e.missing).toEqual(expect.arrayContaining([expect.stringContaining('responsible for operations'), expect.stringContaining('30 days')]));
  });

  it('keeps research-only for a market counsel classified E', () => {
    const e = evaluateMarket(input({ approved: { ...input().approved!, classification: 'E' } }));
    expect(e.maxStatus).toBe('RESEARCH_ONLY');
    expect(e.effectiveStatus).toBe('RESEARCH_ONLY');
  });

  it('lets a person restrict or block whatever the policy allows', () => {
    const r = evaluateMarket(input({ requestedStatus: 'RESTRICTED' }));
    expect(r.effectiveStatus).toBe('RESTRICTED');
    expect(marketAllows(r, 'closing').allowed).toBe(true);
    expect(marketAllows(r, 'seller_contracting').allowed).toBe(false);
    const b = evaluateMarket(input({ requestedStatus: 'BLOCKED' }));
    expect(marketAllows(b, 'closing').allowed).toBe(false);
    expect(marketAllows(b, 'research').allowed).toBe(true);
  });

  it('checks the channel, not just marketing in general', () => {
    const e = evaluateMarket(input());
    expect(channelAllowed(e, 'investor_email').allowed).toBe(true);
    expect(channelAllowed(e, 'public_listing').allowed).toBe(false);
    expect(channelAllowed(e, 'investor_sms').allowed).toBe(false);
  });

  it('measures technical readiness without legal approval', () => {
    const e = evaluateMarket(
      input({
        approved: null,
        requestedStatus: 'RESEARCH_ONLY',
        templates: [
          { kind: 'purchase_agreement', status: 'validated' },
          { kind: 'assignment_agreement', status: 'validated' },
          { kind: 'buyer_disclosure', status: 'validated' },
        ],
      }),
    );
    expect(e.technical.ready).toBe(true);
    expect(e.coverage).toEqual({ research: true, technical: true, active: false });
  });

  it('is not technically ready while it is unknown whether sellers may cancel', () => {
    const draft = approvedContent((c) => {
      c.answers.seller_cancellation_right = { answer: 'unknown', note: '', sourceIds: [] };
    });
    const e = evaluateMarket(input({ draft }));
    expect(e.technical.checks.find((c) => c.key === 'policy_encoded')?.met).toBe(false);
  });

  it('counts the three coverage measures independently', () => {
    const rows = [
      { evaluation: evaluateMarket(input()), researchOnFile: true, dataAccess: true },
      { evaluation: evaluateMarket(input({ approved: null, requestedStatus: 'RESEARCH_ONLY' })), researchOnFile: true, dataAccess: true },
      { evaluation: evaluateMarket(input({ approved: null, draft: null, researchOnFile: false, dataAccess: true, templates: [] })), researchOnFile: false, dataAccess: true },
    ];
    const k = coverageKpis(rows);
    expect(k.research).toEqual({ count: 2, withResearch: 2, withDataAccess: 3 });
    expect(k.technical.count).toBe(2);
    expect(k.active).toEqual({ count: 1, transactionEnabled: 1 });
    expect(k.byStatus.ACTIVE).toBe(1);
  });
});
