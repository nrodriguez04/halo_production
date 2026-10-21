import { ApiError } from './api-fetch';
import type { BuyerPrice } from '@/components/deals/buyer-price-panel';

/**
 * Types for the contract-flipping api (docs/contract-flipping.md). They
 * mirror the api's responses; the api is the source of truth.
 */

export type GateStatus = 'pass' | 'fail' | 'review';

export interface GateCheck {
  key: string;
  label: string;
  status: GateStatus;
  detail: string;
  fix?: string;
  warning?: boolean;
}

export interface Eligibility {
  status: 'eligible' | 'blocked' | 'review_required';
  checks: GateCheck[];
  state: string | null;
  summary: string;
  evaluatedAt: string;
}

export interface PurchaseAgreement {
  id: string;
  status: 'draft' | 'sent' | 'executed' | 'terminated' | 'expired';
  contractId: string | null;
  executedDocumentId: string | null;
  purchasePrice: number | null;
  earnestMoneyAmount: number | null;
  earnestMoneyDueAt: string | null;
  earnestMoneyDepositedAt: string | null;
  inspectionEndsAt: string | null;
  closingDeadline: string | null;
  executedAt: string | null;
  assignability: 'permitted' | 'consent_required' | 'prohibited' | 'unknown';
  assignmentClause: string | null;
  sellerConsentDocumentId: string | null;
  sellerAssignmentNotice: boolean;
  verifiedAt: string | null;
  verifiedBy: string | null;
  terminationReason: string | null;
  notes: string | null;
}

export interface MatchEvidence {
  kind:
    | 'stated_preference'
    | 'historical_purchase'
    | 'inferred_capacity'
    | 'verified_pof'
    | 'unverified_pof'
    | 'expressed_interest'
    | 'offer'
    | 'closing';
  text: string;
}

export interface BuyerMatch {
  buyerId: string;
  name: string;
  score: number;
  contactable: boolean;
  excludedReasons: string[];
  mismatches: string[];
  components: Record<string, number>;
  evidence: MatchEvidence[];
  historicalRange: { min: number; max: number; count: number } | null;
  inferredCapacity: number | null;
  channels: Array<'email' | 'sms'>;
  explanation: string;
}

export interface OfferEvaluation {
  offerId: string;
  amount: number;
  impliedFee: number;
  impliedNet: number;
  meetsMinimum: boolean;
  recommendation: 'accept' | 'counter' | 'reject' | 'hold';
  counterAmount: number | null;
  reasons: string[];
}

export interface PricingRecommendation {
  floorPrice: number;
  targetPrice: number;
  investorCeiling: number | null;
  recommendedPrice: number;
  recommendedFee: number;
  recommendedNet: number;
  demand: 'none' | 'low' | 'moderate' | 'strong';
  spreadInsufficient: boolean;
  changeAskingPrice: boolean;
  rationale: string[];
  offers: OfferEvaluation[];
}

export interface BuyerOffer {
  id: string;
  buyerId: string;
  campaignId: string | null;
  kind: 'indication' | 'written_offer';
  source: string;
  capturedBy: 'person' | 'buyer' | 'agent';
  captureConfidence: number | null;
  confirmedAt: string | null;
  amount: number;
  earnestMoney: number | null;
  closeBy: string | null;
  financing: string | null;
  conditions: string | null;
  status: 'received' | 'countered' | 'accepted' | 'rejected' | 'withdrawn' | 'expired' | 'superseded';
  counterAmount: number | null;
  decisionReason: string | null;
  createdAt: string;
  buyer: {
    id: string;
    name: string;
    company?: string | null;
    pofStatus: string;
    pofAmount: number | null;
    pofExpiresAt?: string | null;
    status?: string;
  };
  recommendation: OfferEvaluation | null;
}

export interface CampaignTarget {
  id: string;
  buyerId: string;
  rank: number;
  score: number;
  status: string;
  skipReason: string | null;
  contactedAt: string | null;
  followUps: number;
  match: BuyerMatch;
  buyer: { id: string; name: string; company: string | null; pofStatus: string };
}

export interface Campaign {
  id: string;
  dealId: string;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'cancelled' | 'expired';
  askingPrice: number;
  floorPrice: number;
  pricing: PricingRecommendation | null;
  outreachSubject: string;
  outreachBody: string;
  followUpDays: number;
  maxFollowUps: number;
  launchedAt: string | null;
  expiresAt: string | null;
  endedReason: string | null;
  createdAt: string;
  targets: CampaignTarget[];
  package: { id: string; version: number; status: string } | null;
}

export interface ClosingMilestone {
  id: string;
  key: string;
  label: string;
  blocking: boolean;
  status: 'pending' | 'done' | 'waived';
  dueAt: string | null;
  completedAt: string | null;
  note: string | null;
}

export interface ClosingIssue {
  id: string;
  kind: string;
  severity: 'blocking' | 'warning';
  description: string;
  status: 'open' | 'resolved';
  resolution: string | null;
  createdAt: string;
}

export interface Assignment {
  id: string;
  buyerId: string;
  offerId: string | null;
  structure: 'assignment' | 'double_close';
  status: 'draft' | 'sent' | 'executed' | 'cancelled';
  assignmentPrice: number;
  assignmentFee: number;
  buyerDepositAmount: number | null;
  buyerDepositDueAt: string | null;
  buyerDepositReceivedAt: string | null;
  executedAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
}

export interface ClosingFile {
  id: string;
  structure: 'assignment' | 'double_close';
  status: 'open' | 'clear_to_close' | 'closed' | 'cancelled';
  titleStatus: string;
  closingAgentCompany: string | null;
  closingAgentOfficer: string | null;
  closingAgentEmail: string | null;
  closingAgentPhone: string | null;
  fileNumber: string | null;
  scheduledClosingAt: string | null;
  closedAt: string | null;
  expectedFee: number | null;
  realizedFee: number | null;
  feeReceivedAt: string | null;
  revenueRecognizedAt: string | null;
  milestones: ClosingMilestone[];
  issues: ClosingIssue[];
  assignment: Assignment | null;
  readiness: {
    clearToClose: boolean;
    blockers: string[];
    attention: Array<{ level: 'overdue' | 'due_soon' | 'blocked' | 'warning'; text: string }>;
  };
}

export interface NextAction {
  kind: string;
  title: string;
  detail: string;
  priority: number;
}

export interface Workspace {
  deal: {
    id: string;
    stage: string;
    arv: number | null;
    repairEstimate: number | null;
    mao: number | null;
    offerAmount: number | null;
    leadId: string | null;
    property: {
      id: string;
      address: string;
      city: string;
      state: string;
      zip: string;
      latitude?: number | null;
      longitude?: number | null;
    } | null;
    lead: { id: string; canonicalOwner?: string | null; canonicalEmail?: string | null } | null;
    contracts: Array<Record<string, any>>;
    economics: Record<string, any> | null;
    buyerPrice: BuyerPrice | null;
  };
  eligibility: Eligibility;
  agreement: PurchaseAgreement | null;
  closing: ClosingFile | null;
  campaigns: Campaign[];
  offers: BuyerOffer[];
  pricing: PricingRecommendation | null;
  matches: BuyerMatch[];
  buyersConsidered: number;
  assignments: Array<Assignment & { offer: { id: string; amount: number; status: string } | null }>;
  approvals: {
    agentRuns: Array<{ id: string; agent: string | null; createdAt: string; summary: unknown }>;
    messages: Array<{ id: string; channel: string; createdAt: string; type: unknown; buyerName: unknown }>;
  };
  economics: {
    contractPrice: number | null;
    askingPrice: number | null;
    projectedFee: number | null;
    projectedNet: number | null;
    realizedFee: number | null;
    realizedAt: string | null;
    revenueStatus: 'projected' | 'realized' | 'lost';
  };
  nextActions: NextAction[];
}

export function money(n: number | null | undefined): string {
  return n == null ? '—' : `$${Math.round(n).toLocaleString('en-US')}`;
}

export function day(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleDateString() : '—';
}

/** The api's own explanation of a refusal, for a toast. */
export function errorText(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as Record<string, unknown> | undefined;
    const msg = body?.message;
    const base = Array.isArray(msg) ? msg.join('; ') : typeof msg === 'string' ? msg : err.message;
    const problems = Array.isArray(body?.problems) ? (body!.problems as string[]).join('; ') : '';
    const blockers = Array.isArray(body?.blockers) ? (body!.blockers as string[]).join('; ') : '';
    return [base, problems, blockers].filter(Boolean).join(' — ');
  }
  return (err as Error)?.message ?? 'Unknown error';
}

export const ELIGIBILITY_LABEL: Record<Eligibility['status'], string> = {
  eligible: 'Eligible to market',
  review_required: 'Needs review',
  blocked: 'Blocked',
};

export const ELIGIBILITY_VARIANT: Record<Eligibility['status'], 'success' | 'warning' | 'destructive'> = {
  eligible: 'success',
  review_required: 'warning',
  blocked: 'destructive',
};

export const EVIDENCE_LABEL: Record<MatchEvidence['kind'], string> = {
  stated_preference: 'Stated',
  historical_purchase: 'Bought',
  inferred_capacity: 'Inferred',
  verified_pof: 'Verified funds',
  unverified_pof: 'Unverified funds',
  expressed_interest: 'Interested',
  offer: 'Offered',
  closing: 'Closed with us',
};

export const EVIDENCE_VARIANT: Record<
  MatchEvidence['kind'],
  'success' | 'info' | 'secondary' | 'warning' | 'primary-soft' | 'outline'
> = {
  stated_preference: 'outline',
  historical_purchase: 'info',
  inferred_capacity: 'secondary',
  verified_pof: 'success',
  unverified_pof: 'warning',
  expressed_interest: 'primary-soft',
  offer: 'primary-soft',
  closing: 'success',
};

export const RECOMMENDATION_VARIANT: Record<OfferEvaluation['recommendation'], 'success' | 'info' | 'destructive' | 'secondary'> = {
  accept: 'success',
  counter: 'info',
  reject: 'destructive',
  hold: 'secondary',
};

/** Which workspace tab each next action is done on. */
export const ACTION_TAB: Record<string, string> = {
  record_agreement: 'contract',
  execute_agreement: 'contract',
  verify_agreement: 'contract',
  fix_gate: 'contract',
  review_policy: 'contract',
  prepare_campaign: 'campaign',
  approve_campaign: 'campaign',
  decide_offers: 'offers',
  confirm_offer: 'offers',
  send_assignment: 'closing',
  record_assignment: 'closing',
  closing_attention: 'closing',
  confirm_closing: 'closing',
  record_fee: 'closing',
  approve_drafts: 'approvals',
};

export function toIsoDate(value: string): string | undefined {
  return value ? new Date(`${value}T12:00:00`).toISOString() : undefined;
}

export function dateInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : '';
}
