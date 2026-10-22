import type {
  AcquisitionType,
  Assignability,
  TaxSaleInterestType,
  TaxSaleTitleStatus,
  DispositionEligibility,
  DispositionEligibilityStatus,
  GateCheck,
  PurchaseAgreementStatus,
} from './types';
import { ACTIVATION_LABEL, type ActivationStatus } from '../markets/policy';

/**
 * The disposition gate: whether a deal may be marketed to buyers and
 * assigned. A pure function of what Halo has on record, so the api, the
 * worker and the tests all reach the same answer, and so every refusal can
 * say exactly which fact is missing.
 *
 * Nothing unknown is treated as permission. A contract whose assignment
 * clause nobody has read, a state whose rules nobody has reviewed, terms
 * nobody has checked against the signed copy: each puts the deal into
 * review, never into marketing.
 */

export interface EligibilityAgreement {
  status: PurchaseAgreementStatus;
  executedAt: Date | null;
  /** The executed copy in the documents library. */
  executedDocumentId: string | null;
  verifiedAt: Date | null;
  assignability: Assignability;
  /** Written consent to assign, when the contract requires it. */
  sellerConsentDocumentId: string | null;
  closingDeadline: Date | null;
  earnestMoneyAmount: number | null;
  earnestMoneyDueAt: Date | null;
  earnestMoneyDepositedAt: Date | null;
}

/**
 * The deal's market, as `evaluateMarket` (markets/evaluate.ts) sees it:
 * whether contracts there may be marketed, and whether the structure the
 * deal will close by is available.
 */
export interface EligibilityMarket {
  status: ActivationStatus;
  /** The approved policy version relied on, if any. */
  version: number | null;
  buyerMarketing: { allowed: boolean; reason: string };
  /** The structure the closing file plans: assignment unless changed. */
  structure: 'assignment' | 'double_close';
  structureAllowed: { allowed: boolean; reason: string };
  /** Conditions the approved policy attaches to that structure. */
  conditions: string | null;
  /** Licences and registrations the market requires that are not in place. */
  missingAuthorizations: string[];
  /** What would move the market forward, from the evaluation. */
  nextStep: string | null;
}

/** A statutory window during which the seller may still cancel. */
export interface EligibilityCancellationWindow {
  label: string;
  endsAt: Date;
}

export interface RequiredDisclosure {
  key: string;
  title: string;
  satisfied: boolean;
}

export interface EligibilityTaxSale {
  interestType: TaxSaleInterestType;
  redemptionEndsAt: Date | null;
  /** The owner redeemed: the interest is gone. */
  redeemed: boolean;
  titleStatus: TaxSaleTitleStatus;
  /** Whether the interest may be transferred, per a person's check. */
  transferable: 'yes' | 'no' | 'unknown';
  verifiedAt: Date | null;
}

export interface EligibilityInput {
  now: Date;
  /** A tax-sale deal needs its acquired interest verified before anything else counts. */
  acquisitionType?: AcquisitionType;
  taxSale?: EligibilityTaxSale | null;
  /** Two-letter state of the property, when known. */
  state: string | null;
  /** The current seller contract, if one is recorded. */
  agreement: EligibilityAgreement | null;
  /** The deal's market, evaluated; null when the state is unknown. */
  market: EligibilityMarket | null;
  /** Seller cancellation windows from the approved policy, if any. */
  cancellationWindows?: EligibilityCancellationWindow[];
  /**
   * Every disclosure the deal needs before buyer marketing, with whether it
   * is on file for the deal or its lead: the policy's keys plus the
   * built-in ones (the Texas equitable-interest notice).
   */
  disclosures: RequiredDisclosure[];
  /** Open blocking issues on the deal's closing file (title, funding, ...). */
  blockingIssues: Array<{ kind: string; description: string }>;
  /** Fewer days than this to the closing deadline is flagged as a warning. */
  warnDaysToClose?: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WARN_DAYS = 10;

const CHECK_LABEL: Record<GateCheck['key'], string> = {
  tax_sale_interest: 'Tax-sale interest verified',
  agreement_on_file: 'Seller contract executed',
  executed_copy: 'Executed copy on file',
  terms_verified: 'Terms verified by a person',
  assignment_rights: 'Contract may be assigned',
  contract_live: 'Contract still in force',
  earnest_money: 'Earnest money deposited on time',
  jurisdiction_policy: 'Market approved for disposition',
  license: 'Licences and registrations in place',
  cancellation_period: 'Seller cancellation window closed',
  buyer_disclosures: 'Buyer disclosures on file',
  blocking_issues: 'No blocking title or closing issue',
};

function check(
  key: GateCheck['key'],
  status: GateCheck['status'],
  detail: string,
  fix?: string,
  warning?: boolean,
): GateCheck {
  return {
    key,
    label: CHECK_LABEL[key],
    status,
    detail,
    ...(fix ? { fix } : {}),
    ...(warning ? { warning: true } : {}),
  };
}

function day(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function agreementChecks(input: EligibilityInput): GateCheck[] {
  const a = input.agreement;
  if (!a) {
    return [
      check(
        'agreement_on_file',
        'fail',
        'No seller contract is recorded for this deal.',
        'Record the purchase agreement (or send it for signature) on the Contract tab.',
      ),
    ];
  }
  const out: GateCheck[] = [];
  if (a.status === 'terminated' || a.status === 'expired') {
    out.push(
      check(
        'agreement_on_file',
        'fail',
        `The seller contract is ${a.status}.`,
        'A terminated or expired contract cannot be marketed or assigned. Record a new agreement if the seller re-signs.',
      ),
    );
    return out;
  }
  if (a.status !== 'executed') {
    out.push(
      check(
        'agreement_on_file',
        'fail',
        `The seller contract is ${a.status}, not executed.`,
        'Wait for every party to sign, then record the executed copy.',
      ),
    );
    return out;
  }
  out.push(
    check(
      'agreement_on_file',
      'pass',
      a.executedAt
        ? `Executed ${day(a.executedAt)}.`
        : 'Executed (date not recorded).',
    ),
  );

  out.push(
    a.executedDocumentId
      ? check('executed_copy', 'pass', 'The signed copy is in the documents library.')
      : check(
          'executed_copy',
          'fail',
          'No executed copy is on file.',
          'Upload the fully signed agreement (or pull the signed copy from DocuSign).',
        ),
  );

  out.push(
    a.verifiedAt
      ? check('terms_verified', 'pass', `Verified ${day(a.verifiedAt)}.`)
      : check(
          'terms_verified',
          'review',
          'Nobody has checked the recorded terms against the signed copy.',
          'Open the agreement, compare each term with the signed copy and verify it.',
        ),
  );

  switch (a.assignability) {
    case 'permitted':
      out.push(
        check('assignment_rights', 'pass', 'The contract permits assignment.'),
      );
      break;
    case 'consent_required':
      out.push(
        a.sellerConsentDocumentId
          ? check(
              'assignment_rights',
              'pass',
              "Assignment needs the seller's consent, and the signed consent is on file.",
            )
          : check(
              'assignment_rights',
              'fail',
              "The contract requires the seller's written consent to assign, and none is on file.",
              "Get the seller's signed consent to the assignment and attach it to the agreement.",
            ),
      );
      break;
    case 'prohibited':
      out.push(
        check(
          'assignment_rights',
          'fail',
          'The contract prohibits assignment.',
          'Renegotiate an assignable contract with the seller, or structure the deal as a double close where the state allows it.',
        ),
      );
      break;
    default:
      out.push(
        check(
          'assignment_rights',
          'review',
          'Whether the contract may be assigned has not been determined.',
          'Read the assignment clause and record what it says.',
        ),
      );
  }

  if (!a.closingDeadline) {
    out.push(
      check(
        'contract_live',
        'review',
        'The closing deadline is not recorded, so Halo cannot tell how long the contract can be marketed.',
        'Record the closing deadline from the agreement.',
      ),
    );
  } else if (a.closingDeadline.getTime() <= input.now.getTime()) {
    out.push(
      check(
        'contract_live',
        'fail',
        `The closing deadline (${day(a.closingDeadline)}) has passed.`,
        'Get a signed extension from the seller and record the new deadline, or terminate the agreement.',
      ),
    );
  } else {
    const days = Math.floor(
      (a.closingDeadline.getTime() - input.now.getTime()) / DAY_MS,
    );
    const warn = days < (input.warnDaysToClose ?? DEFAULT_WARN_DAYS);
    out.push(
      check(
        'contract_live',
        'pass',
        `${days} day(s) to the closing deadline (${day(a.closingDeadline)}).`,
        warn
          ? 'Little time is left to find a buyer; consider asking the seller for an extension.'
          : undefined,
        warn,
      ),
    );
  }

  const emd = a.earnestMoneyAmount ?? 0;
  if (emd > 0) {
    if (a.earnestMoneyDepositedAt) {
      out.push(
        check(
          'earnest_money',
          'pass',
          `Deposited ${day(a.earnestMoneyDepositedAt)}.`,
        ),
      );
    } else if (
      a.earnestMoneyDueAt &&
      a.earnestMoneyDueAt.getTime() < input.now.getTime()
    ) {
      out.push(
        check(
          'earnest_money',
          'fail',
          `The earnest money was due ${day(a.earnestMoneyDueAt)} and no deposit is recorded.`,
          'Deposit it with the title company (or record the deposit), or the seller may treat the contract as breached.',
        ),
      );
    } else {
      out.push(
        check(
          'earnest_money',
          'pass',
          a.earnestMoneyDueAt
            ? `Not yet due (due ${day(a.earnestMoneyDueAt)}).`
            : 'No due date recorded.',
          undefined,
          !a.earnestMoneyDueAt,
        ),
      );
    }
  } else {
    out.push(
      check('earnest_money', 'pass', 'No earnest money is required.'),
    );
  }
  return out;
}

function marketChecks(input: EligibilityInput): GateCheck[] {
  const state = input.state;
  if (!state) {
    return [
      check(
        'jurisdiction_policy',
        'review',
        "The property's state is unknown, so no state's rules can be applied.",
        'Record the property address with its state.',
      ),
    ];
  }
  const m = input.market;
  if (!m) {
    return [
      check(
        'jurisdiction_policy',
        'review',
        `There is no market record for ${state}. Halo does not assume wholesaling is permitted there.`,
        'Open the market on the Markets page.',
      ),
    ];
  }
  const out: GateCheck[] = [];
  const label = ACTIVATION_LABEL[m.status];
  if (m.status === 'RESTRICTED' || m.status === 'BLOCKED') {
    out.push(
      check(
        'jurisdiction_policy',
        'fail',
        `${state} is ${label.toLowerCase()}: contracts there are not marketed.`,
        'A person with markets:activate changes the market status once the reason is resolved.',
      ),
    );
  } else if (!m.buyerMarketing.allowed) {
    out.push(
      check(
        'jurisdiction_policy',
        'review',
        `${state} is ${label.toLowerCase()}. ${m.buyerMarketing.reason}`,
        m.nextStep ?? `Approve ${state} for disposition on the Markets page.`,
      ),
    );
  } else if (!m.structureAllowed.allowed) {
    out.push(
      check(
        'jurisdiction_policy',
        'fail',
        `${state}: ${m.structureAllowed.reason}`,
        m.structure === 'assignment'
          ? 'Do not assign this contract. Change the closing structure to one the policy allows, or have counsel revise the policy.'
          : 'Change the closing structure to one the policy allows, or have counsel revise the policy.',
      ),
    );
  } else {
    out.push(
      check(
        'jurisdiction_policy',
        'pass',
        `${state} is approved for disposition${m.version ? ` (policy v${m.version})` : ''}; ${m.structure.replace('_', ' ')} is available${m.conditions ? ` on conditions: ${m.conditions}` : ''}.`,
      ),
    );
  }
  out.push(
    m.missingAuthorizations.length
      ? check(
          'license',
          'fail',
          `Not in place: ${m.missingAuthorizations.join('; ')}.`,
          `Record and verify each one on the ${state} market page.`,
        )
      : check('license', 'pass', `Every licence and registration ${state} requires for this is in place.`),
  );
  const open = (input.cancellationWindows ?? []).filter((w) => w.endsAt.getTime() > input.now.getTime());
  if (open.length) {
    const last = open.reduce((a, b) => (a.endsAt > b.endsAt ? a : b));
    out.push(
      check(
        'cancellation_period',
        'fail',
        `${last.label} until ${last.endsAt.toISOString().slice(0, 16).replace('T', ' ')} UTC.`,
        'Buyer marketing starts once the window has closed.',
      ),
    );
  } else {
    out.push(
      check(
        'cancellation_period',
        'pass',
        (input.cancellationWindows ?? []).length ? 'The seller cancellation window has closed.' : 'No seller cancellation window applies.',
      ),
    );
  }
  return out;
}

function disclosureCheck(input: EligibilityInput): GateCheck {
  if (input.disclosures.length === 0) {
    return check(
      'buyer_disclosures',
      'pass',
      'No buyer disclosure is required.',
    );
  }
  const missing = input.disclosures.filter((d) => !d.satisfied);
  if (missing.length === 0) {
    return check(
      'buyer_disclosures',
      'pass',
      `On file: ${input.disclosures.map((d) => d.title).join(', ')}.`,
    );
  }
  return check(
    'buyer_disclosures',
    'fail',
    `Missing: ${missing.map((d) => d.title).join(', ')}.`,
    'Upload each one on the Documents page, attached to this deal, with its checklist item.',
  );
}

function issuesCheck(input: EligibilityInput): GateCheck {
  if (input.blockingIssues.length === 0) {
    return check('blocking_issues', 'pass', 'No blocking issue is open.');
  }
  return check(
    'blocking_issues',
    'fail',
    input.blockingIssues
      .map((i) => `${i.kind}: ${i.description}`)
      .join('; '),
    'Resolve each issue (or downgrade it to a warning with a note) on the Closing tab.',
  );
}

/**
 * A tax sale's advertised price is not a purchasable, transferable property
 * interest. Until a person has verified what was actually acquired, that
 * redemption is over and that title can be insured, the deal is held.
 */
function taxSaleCheck(input: EligibilityInput): GateCheck | null {
  if (input.acquisitionType !== 'tax_sale') return null;
  const t = input.taxSale;
  if (!t) {
    return check(
      'tax_sale_interest',
      'review',
      'This is a tax-sale deal and nothing is recorded about the interest acquired.',
      'Record what the sale conveyed (deed, lien certificate or bid), the redemption period, the title status and whether it can be transferred.',
    );
  }
  if (t.interestType === 'tax_lien_certificate') {
    return check(
      'tax_sale_interest',
      'fail',
      'A tax lien certificate is a right to be repaid, not ownership of the property.',
      'Do not market the property. It can only be marketed once a deed is issued and the other checks pass.',
    );
  }
  if (t.interestType === 'auction_bid') {
    return check(
      'tax_sale_interest',
      'fail',
      'A winning bid conveys nothing until the sale is confirmed and the deed issued.',
      'Wait for the deed, then record it.',
    );
  }
  if (t.redeemed) {
    return check(
      'tax_sale_interest',
      'fail',
      'The owner redeemed the property: the interest is gone.',
      'Close the deal as lost.',
    );
  }
  if (t.redemptionEndsAt && t.redemptionEndsAt.getTime() > input.now.getTime()) {
    return check(
      'tax_sale_interest',
      'fail',
      `The owner can still redeem until ${day(t.redemptionEndsAt)}.`,
      'Wait for the redemption period to end.',
    );
  }
  const open: string[] = [];
  if (t.interestType === 'unknown') open.push('what the sale conveyed');
  if (!t.redemptionEndsAt) open.push('the redemption period');
  if (t.titleStatus !== 'insurable') open.push(`the title (${t.titleStatus.replace(/_/g, ' ')})`);
  if (t.transferable === 'no') {
    return check(
      'tax_sale_interest',
      'fail',
      'The interest cannot be transferred.',
      'Do not market it as assignable.',
    );
  }
  if (t.transferable === 'unknown') open.push('whether it can be transferred');
  if (!t.verifiedAt) open.push("a person's verification");
  if (open.length) {
    return check(
      'tax_sale_interest',
      'review',
      `Not yet established: ${open.join(', ')}.`,
      'Confirm with the county records and the title company, then verify the tax-sale record.',
    );
  }
  return check(
    'tax_sale_interest',
    'pass',
    'Deed issued, redemption over, title insurable, transferable, verified.',
  );
}

export function overallStatus(
  checks: GateCheck[],
): DispositionEligibilityStatus {
  if (checks.some((c) => c.status === 'fail')) return 'blocked';
  if (checks.some((c) => c.status === 'review')) return 'review_required';
  return 'eligible';
}

export function evaluateDispositionEligibility(
  input: EligibilityInput,
): DispositionEligibility {
  const tax = taxSaleCheck(input);
  const checks = [
    ...(tax ? [tax] : []),
    ...agreementChecks(input),
    ...marketChecks(input),
    disclosureCheck(input),
    issuesCheck(input),
  ];
  return {
    status: overallStatus(checks),
    checks,
    state: input.state,
    evaluatedAt: input.now.toISOString(),
  };
}

/** A one-line reason for a refusal, from the first check that did not pass. */
export function eligibilitySummary(e: DispositionEligibility): string {
  if (e.status === 'eligible') return 'Eligible for disposition.';
  const first =
    e.checks.find((c) => c.status === 'fail') ??
    e.checks.find((c) => c.status === 'review');
  const prefix =
    e.status === 'blocked' ? 'Blocked' : 'Needs review before disposition';
  return first ? `${prefix}: ${first.label}. ${first.detail}` : prefix;
}
