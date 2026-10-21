import type {
  Assignability,
  DispositionEligibility,
  DispositionEligibilityStatus,
  GateCheck,
  JurisdictionPolicyStatus,
  PermissionValue,
  PurchaseAgreementStatus,
  TriState,
} from './types';

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

export interface EligibilityPolicy {
  status: JurisdictionPolicyStatus;
  assignmentAllowed: PermissionValue;
  licenseRequired: TriState;
  licenseOnFile: boolean;
  /** Checklist keys that must be on file for the deal before buyer marketing. */
  buyerDisclosureKeys: string[];
  reviewExpiresAt: Date | null;
  conditions: string | null;
}

export interface RequiredDisclosure {
  key: string;
  title: string;
  satisfied: boolean;
}

export interface EligibilityInput {
  now: Date;
  /** Two-letter state of the property, when known. */
  state: string | null;
  /** The current seller contract, if one is recorded. */
  agreement: EligibilityAgreement | null;
  /** This tenant's policy for the state, if one exists. */
  policy: EligibilityPolicy | null;
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
  agreement_on_file: 'Seller contract executed',
  executed_copy: 'Executed copy on file',
  terms_verified: 'Terms verified by a person',
  assignment_rights: 'Contract may be assigned',
  contract_live: 'Contract still in force',
  earnest_money: 'Earnest money deposited on time',
  jurisdiction_policy: 'State rules reviewed',
  license: 'Licensing requirement met',
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

function policyChecks(input: EligibilityInput): GateCheck[] {
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
  const p = input.policy;
  if (!p || p.status !== 'reviewed') {
    return [
      check(
        'jurisdiction_policy',
        'review',
        p
          ? `The ${state} policy is ${p.status}, not reviewed.`
          : `No policy is recorded for ${state}. Halo does not assume wholesaling is permitted there.`,
        `Record what counsel confirmed about assigning contracts in ${state} on the Compliance page and mark it reviewed.`,
      ),
    ];
  }
  if (p.reviewExpiresAt && p.reviewExpiresAt.getTime() <= input.now.getTime()) {
    return [
      check(
        'jurisdiction_policy',
        'review',
        `The ${state} review lapsed on ${day(p.reviewExpiresAt)}.`,
        `Re-confirm the ${state} rules and renew the review.`,
      ),
    ];
  }
  const out: GateCheck[] = [];
  switch (p.assignmentAllowed) {
    case 'allowed':
      out.push(
        check(
          'jurisdiction_policy',
          'pass',
          `${state} rules reviewed: assignment is allowed.`,
        ),
      );
      break;
    case 'conditional':
      out.push(
        check(
          'jurisdiction_policy',
          'pass',
          `${state} rules reviewed: assignment is allowed on conditions${p.conditions ? `: ${p.conditions}` : ''}.`,
        ),
      );
      break;
    case 'prohibited':
      out.push(
        check(
          'jurisdiction_policy',
          'fail',
          `The reviewed ${state} policy does not allow assigning this contract.`,
          'Do not market this contract. Discuss another structure with counsel.',
        ),
      );
      break;
    default:
      out.push(
        check(
          'jurisdiction_policy',
          'review',
          `The ${state} policy does not say whether assignment is allowed.`,
          `Record whether ${state} allows assignment and on what conditions.`,
        ),
      );
  }
  if (p.licenseRequired === 'yes') {
    out.push(
      p.licenseOnFile
        ? check('license', 'pass', `${state} requires a license, and one is on file.`)
        : check(
            'license',
            'fail',
            `${state} requires a license for this activity, and none is on file.`,
            'Upload the license to the documents library and link it on the policy.',
          ),
    );
  } else if (p.licenseRequired === 'unknown') {
    out.push(
      check(
        'license',
        'review',
        `Whether ${state} requires a license has not been recorded.`,
        `Record whether ${state} requires a license on the policy.`,
      ),
    );
  } else {
    out.push(
      check('license', 'pass', `${state} requires no license for this activity.`),
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
  const checks = [
    ...agreementChecks(input),
    ...policyChecks(input),
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
