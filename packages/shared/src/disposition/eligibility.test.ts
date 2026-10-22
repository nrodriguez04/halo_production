import {
  evaluateDispositionEligibility,
  eligibilitySummary,
  type EligibilityAgreement,
  type EligibilityTaxSale,
  type EligibilityInput,
  type EligibilityMarket,
} from './eligibility';

const NOW = new Date('2026-10-21T12:00:00Z');
const days = (n: number) => new Date(NOW.getTime() + n * 86_400_000);

function agreement(over: Partial<EligibilityAgreement> = {}): EligibilityAgreement {
  return {
    status: 'executed',
    executedAt: days(-3),
    executedDocumentId: 'doc-signed',
    verifiedAt: days(-2),
    assignability: 'permitted',
    sellerConsentDocumentId: null,
    closingDeadline: days(30),
    earnestMoneyAmount: 1000,
    earnestMoneyDueAt: days(-1),
    earnestMoneyDepositedAt: days(-2),
    ...over,
  };
}

function market(over: Partial<EligibilityMarket> = {}): EligibilityMarket {
  return {
    status: 'APPROVED_FOR_DISPOSITION',
    version: 1,
    buyerMarketing: { allowed: true, reason: 'Marketing contracts to buyers is allowed.' },
    structure: 'assignment',
    structureAllowed: { allowed: true, reason: 'Assigning contracts is allowed.' },
    conditions: null,
    missingAuthorizations: [],
    nextStep: null,
    ...over,
  };
}

function input(over: Partial<EligibilityInput> = {}): EligibilityInput {
  return {
    now: NOW,
    state: 'GA',
    agreement: agreement(),
    market: market(),
    disclosures: [],
    blockingIssues: [],
    ...over,
  };
}

const statusOf = (i: EligibilityInput, key: string) =>
  evaluateDispositionEligibility(i).checks.find((c) => c.key === key)?.status;

describe('evaluateDispositionEligibility', () => {
  it('is eligible when the executed, verified, assignable contract is in a market approved for disposition', () => {
    const e = evaluateDispositionEligibility(input());
    expect(e.status).toBe('eligible');
    expect(e.checks.every((c) => c.status === 'pass')).toBe(true);
    expect(eligibilitySummary(e)).toBe('Eligible for disposition.');
  });

  it('blocks a deal with no seller contract', () => {
    const e = evaluateDispositionEligibility(input({ agreement: null }));
    expect(e.status).toBe('blocked');
    expect(e.checks[0]).toMatchObject({ key: 'agreement_on_file', status: 'fail' });
  });

  it.each(['draft', 'sent'] as const)('blocks a %s contract', (status) => {
    expect(evaluateDispositionEligibility(input({ agreement: agreement({ status }) })).status).toBe('blocked');
  });

  it.each(['terminated', 'expired'] as const)('blocks a %s contract', (status) => {
    const e = evaluateDispositionEligibility(input({ agreement: agreement({ status }) }));
    expect(e.status).toBe('blocked');
    expect(e.checks[0].detail).toContain(status);
  });

  it('blocks when the executed copy is not on file', () => {
    expect(statusOf(input({ agreement: agreement({ executedDocumentId: null }) }), 'executed_copy')).toBe('fail');
  });

  it('needs review when nobody verified the terms', () => {
    const e = evaluateDispositionEligibility(input({ agreement: agreement({ verifiedAt: null }) }));
    expect(e.status).toBe('review_required');
    expect(eligibilitySummary(e)).toContain('Terms verified');
  });

  describe('assignment rights', () => {
    it('blocks a contract that prohibits assignment', () => {
      const e = evaluateDispositionEligibility(input({ agreement: agreement({ assignability: 'prohibited' }) }));
      expect(e.status).toBe('blocked');
      expect(e.checks.find((c) => c.key === 'assignment_rights')?.fix).toContain('double close');
    });

    it('blocks consent-required without the consent, passes with it', () => {
      expect(statusOf(input({ agreement: agreement({ assignability: 'consent_required' }) }), 'assignment_rights')).toBe('fail');
      expect(
        statusOf(
          input({ agreement: agreement({ assignability: 'consent_required', sellerConsentDocumentId: 'doc-consent' }) }),
          'assignment_rights',
        ),
      ).toBe('pass');
    });

    it('never treats an unread clause as permission', () => {
      const e = evaluateDispositionEligibility(input({ agreement: agreement({ assignability: 'unknown' }) }));
      expect(e.status).toBe('review_required');
    });
  });

  describe('contract deadline', () => {
    it('blocks an expired contract', () => {
      const e = evaluateDispositionEligibility(input({ agreement: agreement({ closingDeadline: days(-1) }) }));
      expect(e.status).toBe('blocked');
      expect(e.checks.find((c) => c.key === 'contract_live')?.detail).toContain('has passed');
    });

    it('warns, but passes, when the deadline is close', () => {
      const c = evaluateDispositionEligibility(input({ agreement: agreement({ closingDeadline: days(5) }) })).checks.find(
        (x) => x.key === 'contract_live',
      );
      expect(c).toMatchObject({ status: 'pass', warning: true });
    });

    it('needs review when no deadline is recorded', () => {
      expect(statusOf(input({ agreement: agreement({ closingDeadline: null }) }), 'contract_live')).toBe('review');
    });
  });

  it('blocks when earnest money is past due and not deposited', () => {
    expect(
      statusOf(input({ agreement: agreement({ earnestMoneyDepositedAt: null, earnestMoneyDueAt: days(-1) }) }), 'earnest_money'),
    ).toBe('fail');
    expect(
      statusOf(input({ agreement: agreement({ earnestMoneyDepositedAt: null, earnestMoneyDueAt: days(2) }) }), 'earnest_money'),
    ).toBe('pass');
  });

  describe('market', () => {
    it('needs review when there is no market record for the state', () => {
      const e = evaluateDispositionEligibility(input({ market: null }));
      expect(e.status).toBe('review_required');
      expect(e.checks.find((c) => c.key === 'jurisdiction_policy')?.detail).toContain('does not assume');
    });

    it.each(['RESEARCH_ONLY', 'PENDING_LEGAL_REVIEW', 'PENDING_REQUIREMENTS', 'APPROVED_FOR_ACQUISITION'] as const)(
      'needs review in a market that is %s',
      (status) => {
        const e = evaluateDispositionEligibility(
          input({
            market: market({
              status,
              buyerMarketing: { allowed: false, reason: 'Marketing contracts to buyers is not allowed.' },
              nextStep: 'Counsel reviews and approves the policy.',
            }),
          }),
        );
        expect(e.status).toBe('review_required');
        expect(e.checks.find((c) => c.key === 'jurisdiction_policy')?.fix).toBe('Counsel reviews and approves the policy.');
      },
    );

    it.each(['RESTRICTED', 'BLOCKED'] as const)('blocks in a market a person set to %s', (status) => {
      const e = evaluateDispositionEligibility(
        input({ market: market({ status, buyerMarketing: { allowed: false, reason: 'not allowed' } }) }),
      );
      expect(e.status).toBe('blocked');
    });

    it('blocks a structure the approved policy does not make available', () => {
      const e = evaluateDispositionEligibility(
        input({
          market: market({ structureAllowed: { allowed: false, reason: 'The approved policy does not make assignment available here.' } }),
        }),
      );
      expect(e.status).toBe('blocked');
      expect(eligibilitySummary(e)).toContain('does not make assignment available');
    });

    it('states the conditions an assignment is allowed on', () => {
      const e = evaluateDispositionEligibility(input({ market: market({ conditions: 'SYNTHETIC: notice to the seller' }) }));
      expect(e.checks.find((c) => c.key === 'jurisdiction_policy')?.detail).toContain('SYNTHETIC: notice to the seller');
    });

    it('needs review when the state is unknown', () => {
      expect(evaluateDispositionEligibility(input({ state: null })).status).toBe('review_required');
    });

    it('blocks while a required licence or registration is missing', () => {
      expect(statusOf(input({ market: market({ missingAuthorizations: ['Real estate license'] }) }), 'license')).toBe('fail');
      expect(statusOf(input(), 'license')).toBe('pass');
    });

    it('holds marketing while the seller may still cancel', () => {
      const open = input({ cancellationWindows: [{ label: 'Seller may cancel', endsAt: days(2) }] });
      expect(statusOf(open, 'cancellation_period')).toBe('fail');
      expect(evaluateDispositionEligibility(open).status).toBe('blocked');
      expect(statusOf(input({ cancellationWindows: [{ label: 'Seller may cancel', endsAt: days(-1) }] }), 'cancellation_period')).toBe(
        'pass',
      );
    });
  });

  it('blocks until every required buyer disclosure is on file', () => {
    const e = evaluateDispositionEligibility(
      input({
        disclosures: [
          { key: 'equitable_interest_disclosure', title: 'Equitable interest disclosure (TX)', satisfied: false },
          { key: 'x', title: 'Other', satisfied: true },
        ],
      }),
    );
    expect(e.status).toBe('blocked');
    expect(e.checks.find((c) => c.key === 'buyer_disclosures')?.detail).toBe('Missing: Equitable interest disclosure (TX).');
  });

  it('blocks on an open blocking title issue', () => {
    const e = evaluateDispositionEligibility(input({ blockingIssues: [{ kind: 'title', description: 'Unreleased lien' }] }));
    expect(e.status).toBe('blocked');
    expect(eligibilitySummary(e)).toContain('Unreleased lien');
  });

  it('reports blocked over review when both apply', () => {
    const e = evaluateDispositionEligibility(input({ market: null, agreement: agreement({ assignability: 'prohibited' }) }));
    expect(e.status).toBe('blocked');
    expect(eligibilitySummary(e)).toMatch(/^Blocked: Contract may be assigned/);
  });
});

describe('tax-sale deals', () => {
  const verifiedDeed: EligibilityTaxSale = {
    interestType: 'tax_deed',
    redemptionEndsAt: days(-10),
    redeemed: false,
    titleStatus: 'insurable',
    transferable: 'yes',
    verifiedAt: days(-1),
  };
  const tax = (over: Partial<EligibilityTaxSale> | null) =>
    evaluateDispositionEligibility(
      input({ acquisitionType: 'tax_sale', taxSale: over === null ? null : { ...verifiedDeed, ...over } }),
    );

  it('never treats an unrecorded tax-sale interest as marketable', () => {
    const e = tax(null);
    expect(e.status).toBe('review_required');
    expect(e.checks[0]).toMatchObject({ key: 'tax_sale_interest', status: 'review' });
  });

  it('blocks a lien certificate, a bare bid, a redemption still open and a redeemed property', () => {
    expect(tax({ interestType: 'tax_lien_certificate' }).checks[0].detail).toContain('not ownership');
    expect(tax({ interestType: 'auction_bid' }).status).toBe('blocked');
    expect(tax({ redemptionEndsAt: days(30) }).checks[0].detail).toContain('can still redeem');
    expect(tax({ redeemed: true }).status).toBe('blocked');
    expect(tax({ transferable: 'no' }).status).toBe('blocked');
  });

  it('holds for review until title, transferability and a person check out', () => {
    const e = tax({ titleStatus: 'quiet_title_needed', transferable: 'unknown', verifiedAt: null });
    expect(e.status).toBe('review_required');
    expect(e.checks[0].detail).toContain('the title (quiet title needed)');
    expect(e.checks[0].detail).toContain("a person's verification");
  });

  it('passes a verified deed and leaves standard deals alone', () => {
    expect(tax({}).status).toBe('eligible');
    expect(evaluateDispositionEligibility(input()).checks.some((c) => c.key === 'tax_sale_interest')).toBe(false);
  });
});
