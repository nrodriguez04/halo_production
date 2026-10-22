import { z } from 'zod';

/**
 * A market's policy: what counsel confirmed about operating in one
 * jurisdiction (docs/markets.md). The working draft is edited freely; what
 * the gates rely on is the last approved version, an immutable snapshot of
 * this same content.
 *
 * Unknown is a first-class answer everywhere and it never permits anything.
 */

// ------------------------------------------------------------ activation

/**
 * Where a market stands. The first six form a ladder: each rung allows
 * what the one below does and more. RESTRICTED and BLOCKED are off the
 * ladder: a person sets them to stop activity, whatever the policy allows.
 */
export const ACTIVATION_STATUSES = [
  'RESEARCH_ONLY',
  'PENDING_LEGAL_REVIEW',
  'PENDING_REQUIREMENTS',
  'APPROVED_FOR_ACQUISITION',
  'APPROVED_FOR_DISPOSITION',
  'ACTIVE',
  'RESTRICTED',
  'BLOCKED',
] as const;
export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];

export const ACTIVATION_LADDER: readonly ActivationStatus[] = [
  'RESEARCH_ONLY',
  'PENDING_LEGAL_REVIEW',
  'PENDING_REQUIREMENTS',
  'APPROVED_FOR_ACQUISITION',
  'APPROVED_FOR_DISPOSITION',
  'ACTIVE',
];

export const ACTIVATION_LABEL: Record<ActivationStatus, string> = {
  RESEARCH_ONLY: 'Research only',
  PENDING_LEGAL_REVIEW: 'Pending legal review',
  PENDING_REQUIREMENTS: 'Pending requirements',
  APPROVED_FOR_ACQUISITION: 'Approved for acquisition',
  APPROVED_FOR_DISPOSITION: 'Approved for disposition',
  ACTIVE: 'Active',
  RESTRICTED: 'Restricted',
  BLOCKED: 'Blocked',
};

export function ladderRank(s: ActivationStatus): number {
  return ACTIVATION_LADDER.indexOf(s);
}

/** The lower of two statuses on the ladder; RESTRICTED and BLOCKED always win. */
export function lowerStatus(a: ActivationStatus, b: ActivationStatus): ActivationStatus {
  if (a === 'BLOCKED' || b === 'BLOCKED') return 'BLOCKED';
  if (a === 'RESTRICTED' || b === 'RESTRICTED') return 'RESTRICTED';
  return ladderRank(a) <= ladderRank(b) ? a : b;
}

// ------------------------------------------------------------ activities

/** What Halo does in a market. Each gate asks about one of these. */
export const MARKET_ACTIVITIES = [
  'research',
  'seller_outreach',
  'seller_contracting',
  'buyer_marketing',
  'assignment',
  'double_close',
  'closing',
  'autonomous_operations',
] as const;
export type MarketActivity = (typeof MARKET_ACTIVITIES)[number];

export const ACTIVITY_LABEL: Record<MarketActivity, string> = {
  research: 'Research, sourcing and underwriting',
  seller_outreach: 'Contacting sellers',
  seller_contracting: 'Signing purchase agreements',
  buyer_marketing: 'Marketing contracts to buyers',
  assignment: 'Assigning contracts',
  double_close: 'Double closing',
  closing: 'Closing signed contracts',
  autonomous_operations: 'Agents acting without a person starting each step',
};

/** What each status permits before the policy's own limits apply. */
export const STATUS_ACTIVITIES: Record<ActivationStatus, readonly MarketActivity[]> = {
  RESEARCH_ONLY: ['research'],
  PENDING_LEGAL_REVIEW: ['research'],
  PENDING_REQUIREMENTS: ['research'],
  APPROVED_FOR_ACQUISITION: ['research', 'seller_outreach', 'seller_contracting', 'closing'],
  APPROVED_FOR_DISPOSITION: [
    'research',
    'seller_outreach',
    'seller_contracting',
    'buyer_marketing',
    'assignment',
    'double_close',
    'closing',
  ],
  ACTIVE: [
    'research',
    'seller_outreach',
    'seller_contracting',
    'buyer_marketing',
    'assignment',
    'double_close',
    'closing',
    'autonomous_operations',
  ],
  // Contracts already signed may still close; nothing new starts.
  RESTRICTED: ['research', 'closing'],
  BLOCKED: ['research'],
};

// ------------------------------------------------------------ classification

export const MARKET_CLASSIFICATIONS = ['unclassified', 'A', 'B', 'C', 'D', 'E'] as const;
export type MarketClassification = (typeof MARKET_CLASSIFICATIONS)[number];

export const CLASSIFICATION_LABEL: Record<MarketClassification, string> = {
  unclassified: 'Not classified',
  A: 'A: unlicensed principal assignments permitted',
  B: 'B: permitted with conditions',
  C: 'C: registration or licensing required',
  D: 'D: restricted marketing or assignments',
  E: 'E: not currently authorized',
};

// ------------------------------------------------------------ questions

/** The questions research and counsel answer for every jurisdiction. */
export const MARKET_QUESTIONS = [
  'principal_assignment_without_license',
  'wholesaler_registration_required',
  'license_required_for_activity',
  'disclosures_required',
  'public_marketing_permitted',
  'direct_investor_outreach_permitted',
  'assignment_restrictions',
  'double_closing_permitted',
  'seller_cancellation_right',
  'local_restrictions',
  'out_of_state_entity_requirements',
] as const;
export type MarketQuestion = (typeof MARKET_QUESTIONS)[number];

export const QUESTION_LABEL: Record<MarketQuestion, string> = {
  principal_assignment_without_license: 'Can a principal assign its own contract without a license?',
  wholesaler_registration_required: 'Is a wholesaler registration required?',
  license_required_for_activity: 'Is a license (or licensed broker participation) required for wholesaling as practised?',
  disclosures_required: 'Are wholesaling disclosures or notices required?',
  public_marketing_permitted: 'May an unlicensed principal publicly advertise the property or contract?',
  direct_investor_outreach_permitted: 'May the contract be marketed directly to known investors?',
  assignment_restrictions: 'Are there statutory restrictions on assigning purchase contracts?',
  double_closing_permitted: 'Is a double closing lawful without a license?',
  seller_cancellation_right: 'Does the seller have a statutory right to cancel?',
  local_restrictions: 'Do city or county rules add restrictions?',
  out_of_state_entity_requirements: 'Must an out-of-state entity register to operate?',
};

/**
 * Questions an approval must answer: the ones that decide whether Halo may
 * contract, register, or needs a license. The rest may stay unknown when
 * the structures and channels they bear on are left unused.
 */
export const APPROVAL_REQUIRED_QUESTIONS: readonly MarketQuestion[] = [
  'principal_assignment_without_license',
  'wholesaler_registration_required',
  'license_required_for_activity',
  'disclosures_required',
  'seller_cancellation_right',
  'out_of_state_entity_requirements',
];

export const ANSWERS = ['yes', 'no', 'conditional', 'unknown'] as const;
export type Answer = (typeof ANSWERS)[number];

// ------------------------------------------------------------ structures and channels

export const TRANSACTION_STRUCTURES = [
  'assignment',
  'double_close',
  'licensed_brokerage',
  'purchase_and_resale',
] as const;
export type TransactionStructure = (typeof TRANSACTION_STRUCTURES)[number];

export const STRUCTURE_LABEL: Record<TransactionStructure, string> = {
  assignment: 'Principal assignment of the contract',
  double_close: 'Double close (buy and resell at closing)',
  licensed_brokerage: 'With a licensed brokerage participating',
  purchase_and_resale: 'Purchase, hold and resell',
};

export const MARKETING_CHANNELS = [
  'investor_email',
  'investor_phone',
  'investor_sms',
  'buyer_deal_page',
  'public_listing',
  'social_media',
] as const;
export type MarketingChannel = (typeof MARKETING_CHANNELS)[number];

export const CHANNEL_LABEL: Record<MarketingChannel, string> = {
  investor_email: 'Email to known investors',
  investor_phone: 'Calls to known investors',
  investor_sms: 'Texts to known investors (consent required)',
  buyer_deal_page: 'Private deal pages sent to buyers',
  public_listing: 'Public listings and advertising',
  social_media: 'Social media posts',
};

export const PERMISSIONS = ['allowed', 'conditional', 'prohibited', 'unknown'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export function permits(p: Permission | undefined): boolean {
  return p === 'allowed' || p === 'conditional';
}

// ------------------------------------------------------------ requirements

/** Authorizations Halo tracks per market: who holds what, until when. */
export const AUTHORIZATION_KINDS = [
  'real_estate_license',
  'broker_license',
  'wholesaler_registration',
  'broker_partner_agreement',
  'entity_registration',
  'tax_registration',
  'other',
] as const;
export type AuthorizationKind = (typeof AUTHORIZATION_KINDS)[number];

export const AUTHORIZATION_LABEL: Record<AuthorizationKind, string> = {
  real_estate_license: 'Real estate license',
  broker_license: 'Broker license',
  wholesaler_registration: 'Wholesaler registration',
  broker_partner_agreement: 'Agreement with a licensed broker',
  entity_registration: 'Foreign entity registration',
  tax_registration: 'State tax registration',
  other: 'Other authorization',
};

/** Templates a market can require. Generation and approval: docs/markets.md s6. */
export const TEMPLATE_KINDS = [
  'purchase_agreement',
  'assignment_agreement',
  'seller_disclosure',
  'buyer_disclosure',
  'cancellation_notice',
  'notice',
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  purchase_agreement: 'Purchase agreement',
  assignment_agreement: 'Assignment agreement',
  seller_disclosure: 'Seller disclosure',
  buyer_disclosure: 'Buyer disclosure',
  cancellation_notice: 'Cancellation notice',
  notice: 'Other notice',
};

export const DISCLOSURE_TIMINGS = [
  'before_seller_signs',
  'before_marketing',
  'before_buyer_signs',
  'before_closing',
] as const;
export type DisclosureTiming = (typeof DISCLOSURE_TIMINGS)[number];

export const DEADLINE_TRIGGERS = ['seller_signed', 'assignment_signed'] as const;
export type DeadlineTrigger = (typeof DEADLINE_TRIGGERS)[number];

export const DEADLINE_EFFECTS = ['seller_may_cancel', 'buyer_may_cancel', 'notice_due'] as const;
export type DeadlineEffect = (typeof DEADLINE_EFFECTS)[number];

// ------------------------------------------------------------ content

const KEY = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, 'Use lower-case letters, digits and underscores');
const TEXT = z.string().trim().max(4000);

export const SourceSchema = z.object({
  id: z.string().trim().min(1).max(32),
  citation: z.string().trim().min(1).max(300),
  title: z.string().trim().max(300).default(''),
  url: z.string().trim().url().max(1000).nullable().default(null),
  type: z.enum(['statute', 'regulation', 'regulator_guidance', 'case', 'bill', 'secondary', 'counsel_memo']),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  summary: TEXT.default(''),
});
export type PolicySource = z.infer<typeof SourceSchema>;

export const FindingSchema = z.object({
  answer: z.enum(ANSWERS),
  note: TEXT.default(''),
  sourceIds: z.array(z.string()).max(20).default([]),
});
export type Finding = z.infer<typeof FindingSchema>;

const PermissionEntrySchema = z.object({
  permission: z.enum(PERMISSIONS),
  conditions: TEXT.nullable().default(null),
});
export type PermissionEntry = z.infer<typeof PermissionEntrySchema>;

export const DisclosureRuleSchema = z.object({
  key: KEY,
  title: z.string().trim().min(1).max(200),
  audience: z.enum(['seller', 'buyer']),
  timing: z.enum(DISCLOSURE_TIMINGS),
  /** The template that produces it, when Halo generates it. */
  templateKind: z.enum(TEMPLATE_KINDS).nullable().default(null),
  sourceIds: z.array(z.string()).max(20).default([]),
});
export type DisclosureRule = z.infer<typeof DisclosureRuleSchema>;

export const DeadlineRuleSchema = z.object({
  key: KEY,
  label: z.string().trim().min(1).max(200),
  trigger: z.enum(DEADLINE_TRIGGERS),
  days: z.number().int().min(0).max(365),
  businessDays: z.boolean(),
  effect: z.enum(DEADLINE_EFFECTS),
  /** Hold buyer marketing until the window closes. */
  blocksMarketing: z.boolean().default(true),
  sourceIds: z.array(z.string()).max(20).default([]),
});
export type DeadlineRule = z.infer<typeof DeadlineRuleSchema>;

export const RequirementSchema = z.object({
  key: KEY,
  kind: z.enum(AUTHORIZATION_KINDS),
  label: z.string().trim().min(1).max(200),
  appliesTo: z.array(z.enum(MARKET_ACTIVITIES)).min(1),
  sourceIds: z.array(z.string()).max(20).default([]),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const PendingBillSchema = z.object({
  bill: z.string().trim().min(1).max(100),
  session: z.string().trim().max(50).default(''),
  status: z.string().trim().max(300).default(''),
  url: z.string().trim().url().max(1000).nullable().default(null),
  summary: TEXT.default(''),
});
export type PendingBill = z.infer<typeof PendingBillSchema>;

function record<K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>);
}

export const MarketPolicyContentSchema = z
  .object({
    summary: TEXT.default(''),
    answers: record(MARKET_QUESTIONS, FindingSchema),
    structures: record(TRANSACTION_STRUCTURES, PermissionEntrySchema),
    channels: record(MARKETING_CHANNELS, PermissionEntrySchema),
    disclosures: z.array(DisclosureRuleSchema).max(30).default([]),
    deadlines: z.array(DeadlineRuleSchema).max(20).default([]),
    requirements: z.array(RequirementSchema).max(20).default([]),
    sources: z.array(SourceSchema).max(60).default([]),
    conditions: TEXT.nullable().default(null),
    localRules: TEXT.nullable().default(null),
    openQuestions: z.array(z.string().trim().max(500)).max(40).default([]),
    activationSteps: z.array(z.string().trim().max(500)).max(40).default([]),
    pendingLegislation: z.array(PendingBillSchema).max(20).default([]),
  })
  .superRefine((c, ctx) => {
    const ids = new Set(c.sources.map((s) => s.id));
    const cite = (list: string[], path: (string | number)[]) => {
      for (const id of list) {
        if (!ids.has(id)) ctx.addIssue({ code: 'custom', path, message: `Unknown source "${id}"` });
      }
    };
    for (const q of MARKET_QUESTIONS) cite(c.answers[q].sourceIds, ['answers', q, 'sourceIds']);
    c.disclosures.forEach((d, i) => cite(d.sourceIds, ['disclosures', i, 'sourceIds']));
    c.deadlines.forEach((d, i) => cite(d.sourceIds, ['deadlines', i, 'sourceIds']));
    c.requirements.forEach((r, i) => cite(r.sourceIds, ['requirements', i, 'sourceIds']));
    for (const [name, list] of [
      ['disclosures', c.disclosures],
      ['deadlines', c.deadlines],
      ['requirements', c.requirements],
    ] as const) {
      const seen = new Set<string>();
      list.forEach((item, i) => {
        if (seen.has(item.key)) ctx.addIssue({ code: 'custom', path: [name, i, 'key'], message: `Duplicate key "${item.key}"` });
        seen.add(item.key);
      });
    }
  });
export type MarketPolicyContent = z.infer<typeof MarketPolicyContentSchema>;

/** A draft with every answer unknown and nothing permitted. */
export function emptyPolicyContent(): MarketPolicyContent {
  const unknownFinding = (): Finding => ({ answer: 'unknown', note: '', sourceIds: [] });
  const unknownEntry = (): PermissionEntry => ({ permission: 'unknown', conditions: null });
  return {
    summary: '',
    answers: Object.fromEntries(MARKET_QUESTIONS.map((q) => [q, unknownFinding()])) as MarketPolicyContent['answers'],
    structures: Object.fromEntries(TRANSACTION_STRUCTURES.map((s) => [s, unknownEntry()])) as MarketPolicyContent['structures'],
    channels: Object.fromEntries(MARKETING_CHANNELS.map((c) => [c, unknownEntry()])) as MarketPolicyContent['channels'],
    disclosures: [],
    deadlines: [],
    requirements: [],
    sources: [],
    conditions: null,
    localRules: null,
    openQuestions: [],
    activationSteps: [],
    pendingLegislation: [],
  };
}

/**
 * Read stored content, filling anything an older shape lacks with unknowns.
 * Throws on content that is malformed rather than merely incomplete.
 */
export function parsePolicyContent(raw: unknown): MarketPolicyContent {
  const base = emptyPolicyContent();
  const r = (raw ?? {}) as Partial<MarketPolicyContent>;
  return MarketPolicyContentSchema.parse({
    ...base,
    ...r,
    answers: { ...base.answers, ...(r.answers ?? {}) },
    structures: { ...base.structures, ...(r.structures ?? {}) },
    channels: { ...base.channels, ...(r.channels ?? {}) },
  });
}
