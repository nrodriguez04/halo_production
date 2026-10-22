/**
 * Types for the markets and templates api (docs/markets.md). They mirror
 * the api's responses; the api is the source of truth.
 */

export type ActivationStatus =
  | 'RESEARCH_ONLY'
  | 'PENDING_LEGAL_REVIEW'
  | 'PENDING_REQUIREMENTS'
  | 'APPROVED_FOR_ACQUISITION'
  | 'APPROVED_FOR_DISPOSITION'
  | 'ACTIVE'
  | 'RESTRICTED'
  | 'BLOCKED';

export type Permission = 'allowed' | 'conditional' | 'prohibited' | 'unknown';
export type Answer = 'yes' | 'no' | 'conditional' | 'unknown';
export type Classification = 'unclassified' | 'A' | 'B' | 'C' | 'D' | 'E';

export interface MarketCheck {
  key: string;
  label: string;
  met: boolean;
  detail: string;
}

export interface CoverageKpis {
  total: number;
  research: { count: number; withResearch: number; withDataAccess: number };
  technical: { count: number };
  active: { count: number; transactionEnabled: number };
  byStatus: Record<ActivationStatus, number>;
}

export interface MarketRow {
  state: string;
  name: string;
  region: string;
  classification: Classification;
  classificationSource: 'approved' | 'draft';
  requestedStatus: ActivationStatus;
  effectiveStatus: ActivationStatus;
  maxStatus: ActivationStatus;
  legal: {
    state: 'none' | 'draft' | 'in_review' | 'approved' | 'expired';
    version: number | null;
    approvedAt: string | null;
    reviewExpiresAt: string | null;
    counselName: string | null;
  };
  structures: Array<{ key: string; permission: Permission }>;
  channels: Array<{ key: string; permission: Permission }>;
  requirements: Array<{ key: string; label: string; met: boolean }>;
  disclosures: Array<{ key: string; title: string; audience: 'seller' | 'buyer'; timing: string }>;
  deadlines: Array<{ key: string; label: string; days: number; businessDays: boolean; effect: string }>;
  templates: Array<{ kind: string; status: 'validated' | 'approved'; name: string; version: number; specific: boolean }>;
  sources: { count: number; latestEffectiveDate: string | null; official: number };
  research: { date: string | null; confidence: string | null; importedAt: string | null };
  technical: { ready: boolean; checks: MarketCheck[] };
  coverage: { research: boolean; technical: boolean; active: boolean };
  missing: string[];
  nextStep: string | null;
  openQuestions: number;
  pendingLegislation: number;
  operatorName: string | null;
  selfTest: { ranAt: string; passed: boolean | null; stale: boolean } | null;
  openDeals: number;
  draftError: string | null;
}

export interface MarketMatrix {
  kpis: CoverageKpis;
  dataAccess: { providers: string[]; externalDataEnabled: boolean; states: number };
  rows: MarketRow[];
}

export interface Finding {
  answer: Answer;
  note: string;
  sourceIds: string[];
}

export interface PermissionEntry {
  permission: Permission;
  conditions: string | null;
}

export interface PolicySource {
  id: string;
  citation: string;
  title: string;
  url: string | null;
  type: 'statute' | 'regulation' | 'regulator_guidance' | 'case' | 'bill' | 'secondary' | 'counsel_memo';
  effectiveDate: string | null;
  summary: string;
}

export interface DisclosureRule {
  key: string;
  title: string;
  audience: 'seller' | 'buyer';
  timing: 'before_seller_signs' | 'before_marketing' | 'before_buyer_signs' | 'before_closing';
  templateKind: string | null;
  sourceIds: string[];
}

export interface DeadlineRule {
  key: string;
  label: string;
  trigger: 'seller_signed' | 'assignment_signed';
  days: number;
  businessDays: boolean;
  effect: 'seller_may_cancel' | 'buyer_may_cancel' | 'notice_due';
  blocksMarketing: boolean;
  sourceIds: string[];
}

export interface Requirement {
  key: string;
  kind: string;
  label: string;
  appliesTo: string[];
  sourceIds: string[];
}

export interface PolicyContent {
  summary: string;
  answers: Record<string, Finding>;
  structures: Record<string, PermissionEntry>;
  channels: Record<string, PermissionEntry>;
  disclosures: DisclosureRule[];
  deadlines: DeadlineRule[];
  requirements: Requirement[];
  sources: PolicySource[];
  conditions: string | null;
  localRules: string | null;
  openQuestions: string[];
  activationSteps: string[];
  pendingLegislation: Array<{ bill: string; session: string; status: string; url: string | null; summary: string }>;
}

export interface Authorization {
  id: string;
  state: string;
  kind: string;
  holderName: string;
  holderType: string;
  identifier: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  documentId: string | null;
  status: 'pending' | 'active' | 'expired' | 'revoked';
  verifiedAt: string | null;
  notes: string | null;
}

export interface MarketDetail extends MarketRow {
  market: {
    draftStatus: 'draft' | 'in_review';
    draftUpdatedAt: string | null;
    submittedAt: string | null;
    statusNote: string | null;
    statusSetAt: string | null;
    operatorUserId: string | null;
    operatorName: string | null;
    selfTestResult: { ranAt: string; passed: boolean; steps: Array<{ name: string; passed: boolean; detail: string; skipped?: boolean }> } | null;
    draftClassification: Classification;
  };
  draft: PolicyContent | null;
  approved: PolicyContent | null;
  versions: Array<{
    id: string;
    version: number;
    classification: Classification;
    approvedAt: string;
    approvedBy: string;
    counselName: string;
    counselFirm: string | null;
    memoDocumentId: string;
    reviewExpiresAt: string | null;
    supersededAt: string | null;
  }>;
  authorizations: Authorization[];
  evaluation: {
    rungs: { acquisition: MarketCheck[]; disposition: MarketCheck[]; active: MarketCheck[] };
    activities: Record<string, { allowed: boolean; reason: string }>;
    legal: { unansweredForApproval: string[] };
  };
  questions: Array<{ key: string; label: string; requiredForApproval: boolean }>;
  attestation: string;
}

export const STATUS_LABEL: Record<ActivationStatus, string> = {
  RESEARCH_ONLY: 'Research only',
  PENDING_LEGAL_REVIEW: 'Pending legal review',
  PENDING_REQUIREMENTS: 'Pending requirements',
  APPROVED_FOR_ACQUISITION: 'Approved for acquisition',
  APPROVED_FOR_DISPOSITION: 'Approved for disposition',
  ACTIVE: 'Active',
  RESTRICTED: 'Restricted',
  BLOCKED: 'Blocked',
};

export const STATUS_VARIANT: Record<ActivationStatus, 'secondary' | 'info' | 'warning' | 'success' | 'primary-soft' | 'destructive' | 'outline'> = {
  RESEARCH_ONLY: 'outline',
  PENDING_LEGAL_REVIEW: 'info',
  PENDING_REQUIREMENTS: 'warning',
  APPROVED_FOR_ACQUISITION: 'primary-soft',
  APPROVED_FOR_DISPOSITION: 'primary-soft',
  ACTIVE: 'success',
  RESTRICTED: 'warning',
  BLOCKED: 'destructive',
};

export const CLASSIFICATION_LABEL: Record<Classification, string> = {
  unclassified: 'Not classified',
  A: 'A: unlicensed principal assignments permitted',
  B: 'B: permitted with conditions',
  C: 'C: registration or licensing required',
  D: 'D: restricted marketing or assignments',
  E: 'E: not currently authorized',
};

export const PERMISSION_VARIANT: Record<Permission, 'success' | 'info' | 'destructive' | 'outline'> = {
  allowed: 'success',
  conditional: 'info',
  prohibited: 'destructive',
  unknown: 'outline',
};

export const STRUCTURE_SHORT: Record<string, string> = {
  assignment: 'Assign',
  double_close: 'Double close',
  licensed_brokerage: 'With broker',
  purchase_and_resale: 'Buy & resell',
};

export const CHANNEL_SHORT: Record<string, string> = {
  investor_email: 'Email',
  investor_phone: 'Phone',
  investor_sms: 'SMS',
  buyer_deal_page: 'Deal page',
  public_listing: 'Public',
  social_media: 'Social',
};

export const STRUCTURE_LABEL: Record<string, string> = {
  assignment: 'Principal assignment of the contract',
  double_close: 'Double close (buy and resell at closing)',
  licensed_brokerage: 'With a licensed brokerage participating',
  purchase_and_resale: 'Purchase, hold and resell',
};

export const CHANNEL_LABEL: Record<string, string> = {
  investor_email: 'Email to known investors',
  investor_phone: 'Calls to known investors',
  investor_sms: 'Texts to known investors (consent required)',
  buyer_deal_page: 'Private deal pages sent to buyers',
  public_listing: 'Public listings and advertising',
  social_media: 'Social media posts',
};

export const TEMPLATE_KIND_LABEL: Record<string, string> = {
  purchase_agreement: 'Purchase agreement',
  assignment_agreement: 'Assignment agreement',
  seller_disclosure: 'Seller disclosure',
  buyer_disclosure: 'Buyer disclosure',
  cancellation_notice: 'Cancellation notice',
  notice: 'Other notice',
};

export const ACTIVITIES = [
  'research',
  'seller_outreach',
  'seller_contracting',
  'buyer_marketing',
  'assignment',
  'double_close',
  'closing',
  'autonomous_operations',
] as const;

export const ACTIVITY_LABEL: Record<string, string> = {
  research: 'Research, sourcing and underwriting',
  seller_outreach: 'Contacting sellers',
  seller_contracting: 'Signing purchase agreements',
  buyer_marketing: 'Marketing contracts to buyers',
  assignment: 'Assigning contracts',
  double_close: 'Double closing',
  closing: 'Closing signed contracts',
  autonomous_operations: 'Agents acting on their own',
};

export const AUTHORIZATION_KIND_LABEL: Record<string, string> = {
  real_estate_license: 'Real estate license',
  broker_license: 'Broker license',
  wholesaler_registration: 'Wholesaler registration',
  broker_partner_agreement: 'Agreement with a licensed broker',
  entity_registration: 'Foreign entity registration',
  tax_registration: 'State tax registration',
  other: 'Other authorization',
};

/** The statuses a person sets; the pending ones follow from the review. */
export const SETTABLE_STATUSES: ActivationStatus[] = [
  'RESEARCH_ONLY',
  'APPROVED_FOR_ACQUISITION',
  'APPROVED_FOR_DISPOSITION',
  'ACTIVE',
  'RESTRICTED',
  'BLOCKED',
];
