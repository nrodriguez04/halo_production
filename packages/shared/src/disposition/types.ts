/**
 * The contract-flipping domain: the seller contract Halo holds, the rules of
 * the state it is in, the buyers it is offered to, their offers, and the
 * closing that turns an accepted offer into a collected fee. See
 * docs/contract-flipping.md.
 *
 * Every vocabulary here is a closed list so the api, the worker and the web
 * app agree on it, and so a value the code does not know is a validation
 * error rather than a silent default.
 */

// ------------------------------------------------------ Purchase agreements

/** Where the seller contract stands. Only `executed` can be marketed. */
export const PURCHASE_AGREEMENT_STATUSES = [
  'draft',
  'sent',
  'executed',
  'terminated',
  'expired',
] as const;
export type PurchaseAgreementStatus =
  (typeof PURCHASE_AGREEMENT_STATUSES)[number];

/**
 * What the executed contract says about assigning it. `unknown` is the
 * default and is never treated as permission.
 */
export const ASSIGNABILITY_VALUES = [
  'permitted',
  'consent_required',
  'prohibited',
  'unknown',
] as const;
export type Assignability = (typeof ASSIGNABILITY_VALUES)[number];

export const ASSIGNABILITY_LABEL: Record<Assignability, string> = {
  permitted: 'Assignable without consent',
  consent_required: "Assignable with the seller's written consent",
  prohibited: 'Assignment prohibited',
  unknown: 'Not yet determined',
};

/**
 * The terms a person confirms against the executed copy before Halo relies
 * on them. Every key must be confirmed for the agreement to count as
 * verified.
 */
export const AGREEMENT_VERIFICATION_KEYS = [
  'parties',
  'property',
  'purchase_price',
  'earnest_money',
  'closing_deadline',
  'assignment_clause',
  'signatures',
] as const;
export type AgreementVerificationKey =
  (typeof AGREEMENT_VERIFICATION_KEYS)[number];

export const AGREEMENT_VERIFICATION_LABEL: Record<
  AgreementVerificationKey,
  string
> = {
  parties: 'Seller and buyer names match the title and our entity',
  property: 'Property address and legal description are correct',
  purchase_price: 'Purchase price matches what we recorded',
  earnest_money: 'Earnest money amount and deadline match',
  closing_deadline: 'Closing deadline matches',
  assignment_clause: 'The assignment clause says what we recorded',
  signatures: 'Every party signed and dated',
};

// ---------------------------------------------------- Jurisdiction policies

/**
 * A reviewed policy is one the operator (with counsel) has confirmed. Draft
 * and retired policies are never relied on.
 */
export const JURISDICTION_POLICY_STATUSES = [
  'draft',
  'reviewed',
  'retired',
] as const;
export type JurisdictionPolicyStatus =
  (typeof JURISDICTION_POLICY_STATUSES)[number];

/** A legal question with three answers, the third of which blocks nothing but proves nothing. */
export const TRI_STATE = ['yes', 'no', 'unknown'] as const;
export type TriState = (typeof TRI_STATE)[number];

export const PERMISSION_VALUES = [
  'allowed',
  'conditional',
  'prohibited',
  'unknown',
] as const;
export type PermissionValue = (typeof PERMISSION_VALUES)[number];

// --------------------------------------------------------- Disposition gate

export type GateStatus = 'pass' | 'fail' | 'review';

export const DISPOSITION_CHECK_KEYS = [
  'agreement_on_file',
  'executed_copy',
  'terms_verified',
  'assignment_rights',
  'contract_live',
  'earnest_money',
  'jurisdiction_policy',
  'license',
  'buyer_disclosures',
  'blocking_issues',
] as const;
export type DispositionCheckKey = (typeof DISPOSITION_CHECK_KEYS)[number];

export interface GateCheck {
  key: DispositionCheckKey;
  label: string;
  status: GateStatus;
  /** What was found, in words. */
  detail: string;
  /** What a person does to clear it, when it does not pass. */
  fix?: string;
  /** True for a pass that needs attention soon (a deadline close by). */
  warning?: boolean;
}

/**
 * `eligible`: the deal may be marketed and assigned. `blocked`: something is
 * wrong and must be fixed. `review_required`: nothing is known to be wrong,
 * but something Halo cannot assume (a legal rule, the contract's terms) has
 * not been confirmed by a person.
 */
export type DispositionEligibilityStatus =
  | 'eligible'
  | 'blocked'
  | 'review_required';

export interface DispositionEligibility {
  status: DispositionEligibilityStatus;
  checks: GateCheck[];
  /** The state the rules were taken from, when known. */
  state: string | null;
  evaluatedAt: string;
}

// --------------------------------------------------------------- Buyers

export const BUYER_STATUSES = ['active', 'inactive', 'do_not_market'] as const;
export type BuyerStatus = (typeof BUYER_STATUSES)[number];

/** Where a buyer record came from. Every buyer has one. */
export const BUYER_SOURCES = [
  'manual',
  'import',
  'inbound_inquiry',
  'deal_page',
  'referral',
  'public_record',
] as const;
export type BuyerSource = (typeof BUYER_SOURCES)[number];

export const FUNDING_TYPES = [
  'cash',
  'hard_money',
  'private_money',
  'conventional',
  'unknown',
] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

/** Proof of funds, from nothing to a document a person checked. */
export const POF_STATUSES = [
  'none',
  'requested',
  'received',
  'verified',
  'expired',
  'rejected',
] as const;
export type PofStatus = (typeof POF_STATUSES)[number];

/** Where a recorded purchase came from, and so how far it can be trusted. */
export const BUYER_TRANSACTION_SOURCES = [
  'public_record',
  'buyer_provided',
  'halo_closing',
  'manual',
] as const;
export type BuyerTransactionSource =
  (typeof BUYER_TRANSACTION_SOURCES)[number];

export const INVESTMENT_STRATEGIES = [
  'flip',
  'rental',
  'brrrr',
  'new_construction',
  'wholetail',
  'land',
] as const;
export type InvestmentStrategy = (typeof INVESTMENT_STRATEGIES)[number];

// ------------------------------------------------------ Campaigns + targets

export const CAMPAIGN_STATUSES = [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
  'expired',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const TARGET_STATUSES = [
  'selected',
  'contacted',
  'viewed',
  'interested',
  'offered',
  'declined',
  'opted_out',
  'skipped',
] as const;
export type TargetStatus = (typeof TARGET_STATUSES)[number];

// --------------------------------------------------------------- Offers

export const OFFER_KINDS = ['indication', 'written_offer'] as const;
export type OfferKind = (typeof OFFER_KINDS)[number];

export const OFFER_SOURCES = [
  'email',
  'sms',
  'deal_page',
  'phone',
  'manual',
] as const;
export type OfferSource = (typeof OFFER_SOURCES)[number];

export const OFFER_STATUSES = [
  'received',
  'countered',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
  'superseded',
] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** Offer moves a person may make (or approve an agent's recommendation of). */
export const allowedOfferTransitions: Record<OfferStatus, OfferStatus[]> = {
  received: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded'],
  countered: ['received', 'accepted', 'rejected', 'withdrawn', 'expired', 'superseded'],
  // An accepted offer whose assignment falls through is withdrawn (buyer
  // walked) or rejected (we cancelled); the deal goes back to marketing.
  accepted: ['withdrawn', 'rejected'],
  rejected: [],
  withdrawn: [],
  expired: [],
  superseded: [],
};

export function canTransitionOffer(from: OfferStatus, to: OfferStatus): boolean {
  return from === to || allowedOfferTransitions[from].includes(to);
}

// ------------------------------------------------- Assignment + closing

export const DEAL_STRUCTURES = ['assignment', 'double_close'] as const;
export type DealStructure = (typeof DEAL_STRUCTURES)[number];

export const ASSIGNMENT_STATUSES = [
  'draft',
  'sent',
  'executed',
  'cancelled',
] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const CLOSING_STATUSES = [
  'open',
  'clear_to_close',
  'closed',
  'cancelled',
] as const;
export type ClosingStatus = (typeof CLOSING_STATUSES)[number];

export const TITLE_STATUSES = [
  'not_opened',
  'opened',
  'commitment_received',
  'clear',
  'issues',
] as const;
export type TitleStatus = (typeof TITLE_STATUSES)[number];

export const CLOSING_ISSUE_KINDS = [
  'title',
  'funding',
  'signature',
  'contingency',
  'deadline',
  'other',
] as const;
export type ClosingIssueKind = (typeof CLOSING_ISSUE_KINDS)[number];

export const ISSUE_SEVERITIES = ['blocking', 'warning'] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];

export const MILESTONE_STATUSES = ['pending', 'done', 'waived'] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

/**
 * When an assignment fee counts as revenue. Money received is never
 * confused with money projected: before the configured event, the fee is a
 * projection however certain it looks.
 */
export const REVENUE_RECOGNITION_RULES = [
  'on_funds_received',
  'on_closing_confirmed',
] as const;
export type RevenueRecognitionRule =
  (typeof REVENUE_RECOGNITION_RULES)[number];
