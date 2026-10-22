import type {
  ActivationStatus,
  Answer,
  AuthorizationKind,
  MarketActivity,
  MarketClassification,
  PolicySource,
} from '@halo/shared';
import { marketAgentContext } from '../internal-api.client';

/**
 * What the market agents see, as the api builds it
 * (apps/api/src/data/market-agent-context.service.ts). The worker never
 * reads research, drafts or recorded sales itself.
 */

export interface MarketCandidate {
  key: string;
  label: string;
  kind: 'state' | 'county';
  /** Position in Halo's own ranking; the agent explains it, never changes it. */
  rank: number;
  opportunity: number;
  priority?: number;
  feasibility?: number;
  score?: number;
  status?: ActivationStatus;
  classification?: MarketClassification;
  classificationProposed?: boolean;
  reasons?: string[];
  nextStep?: string | null;
  topCounties?: Array<{ key: string; label: string; opportunity: number }>;
  sales12m?: number;
  medianPrice?: number | null;
  investorPurchases12m?: number;
  distinctInvestors12m?: number;
  cashShare?: number | null;
  latestSale?: string | null;
  sources?: string[];
  components?: Array<{
    label: string;
    points: number;
    max: number;
    basis: string;
    detail: string;
  }>;
}

export interface MarketIntelligenceContext {
  scope: string;
  asOf: string;
  market?: {
    state: string;
    name: string;
    status: ActivationStatus;
    classification: MarketClassification;
    classificationProposed: boolean;
    nextStep: string | null;
  } | null;
  candidates: MarketCandidate[];
  coverage: { counties: number; states: number; unscoredStates?: number };
  kpis: Record<string, unknown>;
}

export interface MarketExpansionContext {
  market: {
    state: string;
    name: string;
    requestedStatus: ActivationStatus;
    effectiveStatus: ActivationStatus;
    draftStatus: 'draft' | 'in_review' | string;
    classification: MarketClassification;
    approvedVersion: number | null;
    nextStep: string | null;
    missing: string[];
  };
  draft: {
    summary: string;
    answers: Record<
      string,
      { answer: Answer; note: string; sourceIds: string[] }
    >;
    requirements: Array<{
      key: string;
      kind: AuthorizationKind;
      label: string;
      appliesTo: MarketActivity[];
    }>;
    disclosures: Array<{
      key: string;
      title: string;
      audience: string;
      timing: string;
    }>;
    deadlines: Array<{
      label: string;
      days: number;
      businessDays: boolean;
      effect: string;
    }>;
    openQuestions: string[];
    activationSteps: string[];
    sources: Array<
      Pick<PolicySource, 'id' | 'citation' | 'type' | 'url' | 'effectiveDate'>
    >;
  } | null;
  unanswered: Array<{
    key: string;
    label: string;
    requiredForApproval: boolean;
  }>;
  research: {
    researchedAt: string;
    confidence: 'low' | 'medium' | 'high';
    summary: string;
    proposedClassification: string;
    classificationRationale: string;
    regulator: { name: string; url: string | null } | null;
    findings: Record<
      string,
      { answer: Answer; note: string; sourceIds: string[] }
    >;
    sources: PolicySource[];
    pendingLegislation: Array<{
      bill: string;
      session: string;
      status: string;
      summary: string;
    }>;
    openQuestions: string[];
    activationSteps: string[];
  } | null;
  authorizations: Array<{ kind: string; status: string; verified: boolean }>;
  opportunity: {
    counties: number;
    top: Array<{
      label: string;
      opportunity: number;
      sales12m: number;
      investorPurchases12m: number;
    }>;
  };
}

export function loadMarketIntelligenceContext(
  scope: string,
  accountId: string,
): Promise<MarketIntelligenceContext> {
  return marketAgentContext<MarketIntelligenceContext>(
    accountId,
    'market_intelligence',
    scope,
  );
}

export function loadMarketExpansionContext(
  state: string,
  accountId: string,
): Promise<MarketExpansionContext> {
  return marketAgentContext<MarketExpansionContext>(
    accountId,
    'market_expansion',
    state,
  );
}
