import {
  ACTIVATION_LABEL,
  ACTIVATION_LADDER,
  ACTIVITY_LABEL,
  APPROVAL_REQUIRED_QUESTIONS,
  MARKETING_CHANNELS,
  type ApprovalBasis,
  MARKET_ACTIVITIES,
  STATUS_ACTIVITIES,
  TEMPLATE_KIND_LABEL,
  TRANSACTION_STRUCTURES,
  ladderRank,
  lowerStatus,
  permits,
  type ActivationStatus,
  type AuthorizationKind,
  type MarketActivity,
  type MarketClassification,
  type MarketPolicyContent,
  type MarketQuestion,
  type MarketingChannel,
  type Requirement,
  type TemplateKind,
  type TransactionStructure,
} from './policy';

/**
 * Where a market stands and what it may do (docs/markets.md s3). Pure: the
 * api loads the records and this decides. Three things are kept apart:
 *
 * - legal: the approved policy, as an immutable version, approved by
 *   counsel or accepted by the owner (the basis is always reported);
 * - readiness: what Halo has in place to operate there (templates,
 *   authorizations, an operator, a passing self-test);
 * - activation: what a person asked for.
 *
 * The effective status is the lower of what was asked for and what legal
 * approval and readiness support. Nothing is ever promoted automatically.
 */

export interface MarketAuthorizationInput {
  kind: AuthorizationKind;
  status: 'active' | 'pending' | 'expired' | 'revoked';
  verifiedAt: Date | null;
  expiresAt: Date | null;
}

export interface MarketTemplateInput {
  kind: TemplateKind;
  /** validated: uploaded and every merge field is known; approved: counsel approved it or the owner accepted it. */
  status: 'draft' | 'validated' | 'approved';
}

export interface MarketInput {
  code: string;
  now: Date;
  requestedStatus: ActivationStatus;
  draft: MarketPolicyContent | null;
  /** The draft has been submitted for legal review. */
  draftInReview: boolean;
  approved: {
    version: number;
    content: MarketPolicyContent;
    classification: MarketClassification;
    approvedAt: Date;
    reviewExpiresAt: Date | null;
    basis: ApprovalBasis;
  } | null;
  authorizations: MarketAuthorizationInput[];
  /** Template versions that apply to this jurisdiction, newest per kind and status. */
  templates: MarketTemplateInput[];
  /** A person is responsible for operations in the market. */
  operatorAssigned: boolean;
  selfTest: { ranAt: Date; passed: boolean; stale: boolean } | null;
  /** Halo can pull property data for the jurisdiction. */
  dataAccess: boolean;
  /** Research or a draft policy is on file. */
  researchOnFile: boolean;
  /**
   * Every jurisdiction is open on the owner's own legal judgment
   * (docs/markets.md s12). Only a state a person blocked or restricted
   * stays closed.
   */
  nationwide?: NationwideOperation | null;
}

export interface NationwideOperation {
  since: Date;
  byName: string;
}

export interface MarketCheck {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export type LegalState = 'none' | 'draft' | 'in_review' | 'approved' | 'expired';

export interface MarketEvaluation {
  code: string;
  requestedStatus: ActivationStatus;
  /** The highest status legal approval and readiness support now. */
  maxStatus: ActivationStatus;
  effectiveStatus: ActivationStatus;
  legal: {
    state: LegalState;
    version: number | null;
    approvedAt: Date | null;
    reviewExpiresAt: Date | null;
    /** Counsel's approval or the owner's risk acceptance; null with no approved version. */
    basis: ApprovalBasis | null;
    classification: MarketClassification;
    /** Questions an approval must answer that the draft leaves unknown. */
    unansweredForApproval: MarketQuestion[];
  };
  /** What each rung of the ladder needs, met or not. */
  rungs: {
    acquisition: MarketCheck[];
    disposition: MarketCheck[];
    active: MarketCheck[];
  };
  activities: Record<MarketActivity, { allowed: boolean; reason: string }>;
  structures: TransactionStructure[];
  channels: MarketingChannel[];
  technical: { ready: boolean; checks: MarketCheck[] };
  coverage: { research: boolean; technical: boolean; active: boolean };
  /** What would move the market up, in words. */
  missing: string[];
  nextStep: string | null;
  /** Set when the market is open by the owner's nationwide decision rather than its own approval. */
  nationwide: NationwideOperation | null;
}

const SELF_TEST_MAX_AGE_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function authorizationMet(kind: AuthorizationKind, list: MarketAuthorizationInput[], now: Date): boolean {
  return list.some(
    (a) =>
      a.kind === kind &&
      a.status === 'active' &&
      !!a.verifiedAt &&
      (!a.expiresAt || a.expiresAt.getTime() > now.getTime()),
  );
}

function templateAt(kind: TemplateKind, list: MarketTemplateInput[], level: 'validated' | 'approved'): boolean {
  return list.some((t) => t.kind === kind && (t.status === 'approved' || (level === 'validated' && t.status === 'validated')));
}

function requirementChecks(
  reqs: Requirement[],
  activities: MarketActivity[],
  input: MarketInput,
): MarketCheck[] {
  return reqs
    .filter((r) => r.appliesTo.some((a) => activities.includes(a)))
    .map((r) => {
      const met = authorizationMet(r.kind, input.authorizations, input.now);
      return {
        key: `requirement:${r.key}`,
        label: r.label,
        met,
        detail: met ? `${r.label} is on file and current.` : `${r.label} is not on file, not verified, or has expired.`,
      };
    });
}

function templateCheck(kind: TemplateKind, input: MarketInput, why: string): MarketCheck {
  const met = templateAt(kind, input.templates, 'approved');
  return {
    key: `template:${kind}`,
    label: `${TEMPLATE_KIND_LABEL[kind]} template approved`,
    met,
    detail: met
      ? `An approved ${TEMPLATE_KIND_LABEL[kind].toLowerCase()} template applies here.`
      : `No approved ${TEMPLATE_KIND_LABEL[kind].toLowerCase()} template applies here (${why}).`,
  };
}

/** Structures that are permitted, with their templates and authorizations in place. */
function usableStructures(c: MarketPolicyContent, input: MarketInput): TransactionStructure[] {
  return TRANSACTION_STRUCTURES.filter((s) => {
    if (!permits(c.structures[s].permission)) return false;
    const act: MarketActivity | null = s === 'assignment' ? 'assignment' : s === 'double_close' ? 'double_close' : null;
    if (act && requirementChecks(c.requirements, [act], input).some((x) => !x.met)) return false;
    if (s === 'assignment' && !templateAt('assignment_agreement', input.templates, 'approved')) return false;
    return true;
  });
}

function acquisitionChecks(c: MarketPolicyContent, classification: MarketClassification, input: MarketInput): MarketCheck[] {
  const checks: MarketCheck[] = [
    {
      key: 'classification',
      label: 'Classified as operable',
      met: classification !== 'E' && classification !== 'unclassified',
      detail:
        classification === 'E'
          ? 'The approved policy classifies the market as not currently authorized.'
          : classification === 'unclassified'
            ? 'The approved policy has no classification.'
            : `Classified ${classification}.`,
    },
    templateCheck('purchase_agreement', input, 'needed to sign with sellers'),
  ];
  for (const d of c.disclosures.filter((x) => x.audience === 'seller' && x.templateKind)) {
    checks.push(templateCheck(d.templateKind!, input, `for the ${d.title}`));
  }
  if (c.deadlines.some((d) => d.effect === 'seller_may_cancel') && c.answers.seller_cancellation_right.answer !== 'no') {
    // The notice is generated only when the policy names a template for it.
    for (const d of c.disclosures.filter((x) => x.templateKind === 'cancellation_notice')) {
      checks.push(templateCheck('cancellation_notice', input, `for the ${d.title}`));
    }
  }
  checks.push(...requirementChecks(c.requirements, ['seller_outreach', 'seller_contracting'], input));
  return dedupe(checks);
}

function dispositionChecks(c: MarketPolicyContent, input: MarketInput): MarketCheck[] {
  const usable = usableStructures(c, input);
  const permitted = TRANSACTION_STRUCTURES.filter((s) => permits(c.structures[s].permission));
  const channels = MARKETING_CHANNELS.filter((ch) => permits(c.channels[ch].permission));
  const checks: MarketCheck[] = [
    {
      key: 'structure',
      label: 'A disposition structure is available',
      met: usable.length > 0,
      detail:
        usable.length > 0
          ? `Available: ${usable.join(', ').replace(/_/g, ' ')}.`
          : permitted.length === 0
            ? 'The approved policy permits no way to dispose of a contract.'
            : `Permitted (${permitted.join(', ').replace(/_/g, ' ')}) but missing its template or authorization.`,
    },
    {
      key: 'channel',
      label: 'A marketing channel is permitted',
      met: channels.length > 0,
      detail: channels.length > 0 ? `Permitted: ${channels.join(', ').replace(/_/g, ' ')}.` : 'The approved policy permits no channel.',
    },
  ];
  if (permits(c.structures.assignment.permission)) {
    checks.push(templateCheck('assignment_agreement', input, 'needed to assign'));
  }
  for (const d of c.disclosures.filter((x) => x.audience === 'buyer' && x.templateKind)) {
    checks.push(templateCheck(d.templateKind!, input, `for the ${d.title}`));
  }
  checks.push(...requirementChecks(c.requirements, ['buyer_marketing'], input));
  return dedupe(checks);
}

function activeChecks(c: MarketPolicyContent, input: MarketInput): MarketCheck[] {
  const t = input.selfTest;
  const fresh = !!t && t.passed && !t.stale && input.now.getTime() - t.ranAt.getTime() <= SELF_TEST_MAX_AGE_DAYS * DAY_MS;
  return dedupe([
    {
      key: 'operator',
      label: 'An operator is responsible',
      met: input.operatorAssigned,
      detail: input.operatorAssigned ? 'A person owns operations here.' : 'Assign the person responsible for operations here.',
    },
    {
      key: 'self_test',
      label: 'Self-test passed in the last 30 days',
      met: fresh,
      detail: !t
        ? 'The market self-test has not been run.'
        : !t.passed
          ? 'The last self-test failed.'
          : t.stale
            ? 'The policy or a template changed after the last self-test.'
            : fresh
              ? 'The last self-test passed.'
              : 'The last self-test is more than 30 days old.',
    },
    ...requirementChecks(c.requirements, ['autonomous_operations'], input),
  ]);
}

function dedupe(checks: MarketCheck[]): MarketCheck[] {
  const seen = new Set<string>();
  return checks.filter((c) => (seen.has(c.key) ? false : (seen.add(c.key), true)));
}

function technicalChecks(c: MarketPolicyContent | null, input: MarketInput): MarketCheck[] {
  if (!c) {
    return [{ key: 'policy_encoded', label: 'Rules encoded', met: false, detail: 'No policy draft exists yet.' }];
  }
  const a = c.answers;
  const disclosuresKnown = a.disclosures_required.answer !== 'unknown';
  const cancelKnown = a.seller_cancellation_right.answer !== 'unknown';
  const disclosuresEncoded = a.disclosures_required.answer !== 'yes' || c.disclosures.length > 0;
  const cancelEncoded = a.seller_cancellation_right.answer !== 'yes' || c.deadlines.some((d) => d.effect === 'seller_may_cancel');
  const encoded = disclosuresKnown && cancelKnown && disclosuresEncoded && cancelEncoded;
  const checks: MarketCheck[] = [
    {
      key: 'policy_encoded',
      label: 'Disclosures and cancellation rules encoded',
      met: encoded,
      detail: !disclosuresKnown || !cancelKnown
        ? 'Whether the state requires disclosures or gives sellers a cancellation right is still unknown.'
        : !disclosuresEncoded
          ? 'Disclosures are required but none is encoded.'
          : !cancelEncoded
            ? 'Sellers may cancel but no cancellation window is encoded.'
            : 'The disclosures and windows the state requires are encoded.',
    },
    {
      key: 'template:purchase_agreement',
      label: 'Purchase agreement template ready',
      met: templateAt('purchase_agreement', input.templates, 'validated'),
      detail: templateAt('purchase_agreement', input.templates, 'validated')
        ? 'A purchase agreement template with valid merge fields applies here.'
        : 'No purchase agreement template with valid merge fields applies here.',
    },
  ];
  if (c.structures.assignment.permission !== 'prohibited') {
    const ok = templateAt('assignment_agreement', input.templates, 'validated');
    checks.push({
      key: 'template:assignment_agreement',
      label: 'Assignment agreement template ready',
      met: ok,
      detail: ok ? 'An assignment template with valid merge fields applies here.' : 'No assignment template with valid merge fields applies here.',
    });
  }
  for (const d of c.disclosures.filter((x) => x.templateKind)) {
    const ok = templateAt(d.templateKind!, input.templates, 'validated');
    checks.push({
      key: `template:${d.templateKind}`,
      label: `${TEMPLATE_KIND_LABEL[d.templateKind!]} template ready`,
      met: ok,
      detail: ok ? `A template for the ${d.title} applies here.` : `No template for the ${d.title} applies here.`,
    });
  }
  const t = input.selfTest;
  checks.push({
    key: 'self_test',
    label: 'Self-test passed',
    met: !!t && t.passed && !t.stale,
    detail: !t ? 'Not run yet.' : !t.passed ? 'The last run failed.' : t.stale ? 'Out of date: something changed since.' : 'Passed.',
  });
  return dedupe(checks);
}

export function evaluateMarket(input: MarketInput): MarketEvaluation {
  const ap = input.approved;
  const expired = !!ap?.reviewExpiresAt && ap.reviewExpiresAt.getTime() <= input.now.getTime();
  const legalState: LegalState = ap
    ? expired
      ? 'expired'
      : 'approved'
    : input.draftInReview
      ? 'in_review'
      : input.draft
        ? 'draft'
        : 'none';
  const working = input.draft ?? ap?.content ?? null;
  const unansweredForApproval = working
    ? APPROVAL_REQUIRED_QUESTIONS.filter((q) => working.answers[q].answer === 'unknown')
    : [...APPROVAL_REQUIRED_QUESTIONS];

  let maxStatus: ActivationStatus;
  let acquisition: MarketCheck[] = [];
  let disposition: MarketCheck[] = [];
  let active: MarketCheck[] = [];
  const missing: string[] = [];

  if (!ap || expired) {
    maxStatus = input.draftInReview || expired ? 'PENDING_LEGAL_REVIEW' : 'RESEARCH_ONLY';
    missing.push(
      expired
        ? ap!.basis === 'owner_risk_acceptance'
          ? `The owner's risk acceptance lapsed on ${ap!.reviewExpiresAt!.toISOString().slice(0, 10)}; accept the policy again or have counsel approve it.`
          : `The legal review lapsed on ${ap!.reviewExpiresAt!.toISOString().slice(0, 10)}; counsel must approve the policy again.`
        : input.draftInReview
          ? 'Counsel has not yet approved the policy.'
          : 'No policy has been approved by counsel or accepted by the owner.',
    );
  } else {
    const c = ap.content;
    acquisition = acquisitionChecks(c, ap.classification, input);
    disposition = dispositionChecks(c, input);
    active = activeChecks(c, input);
    if (ap.classification === 'E') {
      maxStatus = 'RESEARCH_ONLY';
      missing.push('The approved policy classifies this market as not currently authorized. Research continues; see the activation steps.');
    } else if (acquisition.some((x) => !x.met)) {
      maxStatus = 'PENDING_REQUIREMENTS';
      missing.push(...acquisition.filter((x) => !x.met).map((x) => x.detail));
    } else if (disposition.some((x) => !x.met)) {
      maxStatus = 'APPROVED_FOR_ACQUISITION';
      missing.push(...disposition.filter((x) => !x.met).map((x) => x.detail));
    } else if (active.some((x) => !x.met)) {
      maxStatus = 'APPROVED_FOR_DISPOSITION';
      missing.push(...active.filter((x) => !x.met).map((x) => x.detail));
    } else {
      maxStatus = 'ACTIVE';
    }
  }

  // A person's request is a ceiling. Below the first approval rung, the
  // market shows how far through review and requirements it has come.
  const req = input.requestedStatus;
  let effectiveStatus: ActivationStatus;
  if (req === 'RESTRICTED' || req === 'BLOCKED') effectiveStatus = req;
  else if (ladderRank(req) >= ladderRank('APPROVED_FOR_ACQUISITION')) effectiveStatus = lowerStatus(req, maxStatus);
  else effectiveStatus = lowerStatus(maxStatus, 'PENDING_REQUIREMENTS');

  const content = ap && !expired ? ap.content : null;
  const structures = content ? usableStructures(content, input) : [];
  const channels = content ? MARKETING_CHANNELS.filter((ch) => permits(content.channels[ch].permission)) : [];
  const statusAllows = new Set(STATUS_ACTIVITIES[effectiveStatus]);

  const activities = Object.fromEntries(
    MARKET_ACTIVITIES.map((act) => {
      if (!statusAllows.has(act)) {
        return [act, { allowed: false, reason: `${ACTIVITY_LABEL[act]} is not allowed while the market is ${ACTIVATION_LABEL[effectiveStatus].toLowerCase()}.` }];
      }
      if (content) {
        const unmet = requirementChecks(content.requirements, [act], input).filter((x) => !x.met);
        if (unmet.length) return [act, { allowed: false, reason: unmet.map((x) => x.detail).join(' ') }];
        if (act === 'assignment' && !structures.includes('assignment')) {
          return [act, { allowed: false, reason: 'The approved policy does not make assignment available here.' }];
        }
        if (act === 'double_close' && !structures.includes('double_close')) {
          return [act, { allowed: false, reason: 'The approved policy does not make double closing available here.' }];
        }
        if (act === 'buyer_marketing' && channels.length === 0) {
          return [act, { allowed: false, reason: 'The approved policy permits no marketing channel here.' }];
        }
      }
      return [act, { allowed: true, reason: `${ACTIVITY_LABEL[act]} is allowed.` }];
    }),
  ) as MarketEvaluation['activities'];

  const technical = technicalChecks(working, input);
  const technicalReady = technical.every((x) => x.met);

  let nextStep: string | null = null;
  if (req === 'BLOCKED' || req === 'RESTRICTED') nextStep = null;
  else if (legalState === 'none' || legalState === 'draft') nextStep = unansweredForApproval.length
    ? `Answer ${unansweredForApproval.length} open legal question(s), then submit the policy to counsel or accept it as the owner.`
    : 'Submit the policy to counsel, or accept it as the owner.';
  else if (legalState === 'in_review') nextStep = 'Counsel reviews and approves the policy.';
  else if (legalState === 'expired')
    nextStep = ap?.basis === 'owner_risk_acceptance' ? 'The owner accepts the policy again, or counsel approves it.' : 'Counsel renews the legal review.';
  else if (missing.length) nextStep = missing[0];
  else if (ladderRank(effectiveStatus) < ladderRank(maxStatus)) {
    const next = ACTIVATION_LADDER[Math.max(ladderRank(effectiveStatus) + 1, ladderRank('APPROVED_FOR_ACQUISITION'))];
    nextStep = `Ready: a person with markets:activate can move the market to ${next}.`;
  }

  const evaluation: MarketEvaluation = {
    code: input.code,
    requestedStatus: req,
    maxStatus,
    effectiveStatus,
    legal: {
      state: legalState,
      version: ap?.version ?? null,
      approvedAt: ap?.approvedAt ?? null,
      reviewExpiresAt: ap?.reviewExpiresAt ?? null,
      basis: ap?.basis ?? null,
      classification: ap?.classification ?? 'unclassified',
      unansweredForApproval,
    },
    rungs: { acquisition, disposition, active },
    activities,
    structures,
    channels,
    technical: { ready: technicalReady, checks: technical },
    coverage: {
      research: input.researchOnFile && input.dataAccess,
      technical: technicalReady,
      active: effectiveStatus === 'ACTIVE',
    },
    missing,
    nextStep,
    nationwide: null,
  };
  // A person's block or restriction on one state outlasts the nationwide decision.
  if (input.nationwide && req !== 'BLOCKED' && req !== 'RESTRICTED') {
    return openNationwide(evaluation, input.nationwide);
  }
  return evaluation;
}

/**
 * The market as the owner's nationwide decision leaves it: active for every
 * activity, structure and channel. The legal, readiness and technical
 * findings stay as they were, for reference; none of them gates anything.
 */
function openNationwide(e: MarketEvaluation, n: NationwideOperation): MarketEvaluation {
  const reason = `Open in every state by ${n.byName}'s decision; Halo has not verified the law here.`;
  return {
    ...e,
    maxStatus: 'ACTIVE',
    effectiveStatus: 'ACTIVE',
    activities: Object.fromEntries(
      MARKET_ACTIVITIES.map((act) => [act, { allowed: true, reason }]),
    ) as MarketEvaluation['activities'],
    structures: [...TRANSACTION_STRUCTURES],
    channels: [...MARKETING_CHANNELS],
    coverage: { ...e.coverage, active: true },
    missing: [],
    nextStep: null,
    nationwide: n,
  };
}

/** May this market do this, and if not, why not. */
export function marketAllows(e: MarketEvaluation, activity: MarketActivity): { allowed: boolean; reason: string } {
  return e.activities[activity];
}

/** May a contract here be marketed on this channel. */
export function channelAllowed(e: MarketEvaluation, channel: MarketingChannel): { allowed: boolean; reason: string } {
  const m = e.activities.buyer_marketing;
  if (!m.allowed) return m;
  return e.channels.includes(channel)
    ? { allowed: true, reason: 'Permitted by the approved policy.' }
    : { allowed: false, reason: `The approved policy does not permit ${channel.replace(/_/g, ' ')} here.` };
}

export interface CoverageKpis {
  total: number;
  research: { count: number; withResearch: number; withDataAccess: number };
  technical: { count: number };
  active: { count: number; transactionEnabled: number };
  byStatus: Record<ActivationStatus, number>;
}

/** The three coverage measures, counted independently (docs/markets.md s2). */
export function coverageKpis(
  rows: Array<{ evaluation: MarketEvaluation; researchOnFile: boolean; dataAccess: boolean }>,
): CoverageKpis {
  const byStatus = Object.fromEntries(
    ['RESEARCH_ONLY', 'PENDING_LEGAL_REVIEW', 'PENDING_REQUIREMENTS', 'APPROVED_FOR_ACQUISITION', 'APPROVED_FOR_DISPOSITION', 'ACTIVE', 'RESTRICTED', 'BLOCKED'].map(
      (s) => [s, 0],
    ),
  ) as Record<ActivationStatus, number>;
  for (const r of rows) byStatus[r.evaluation.effectiveStatus] += 1;
  return {
    total: rows.length,
    research: {
      count: rows.filter((r) => r.evaluation.coverage.research).length,
      withResearch: rows.filter((r) => r.researchOnFile).length,
      withDataAccess: rows.filter((r) => r.dataAccess).length,
    },
    technical: { count: rows.filter((r) => r.evaluation.coverage.technical).length },
    active: {
      count: rows.filter((r) => r.evaluation.coverage.active).length,
      transactionEnabled: rows.filter((r) => ladderRank(r.evaluation.effectiveStatus) >= ladderRank('APPROVED_FOR_ACQUISITION')).length,
    },
    byStatus,
  };
}
