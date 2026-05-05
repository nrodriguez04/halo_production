// Shared types for IntegrationCostControlService.
//
// Every paid external call in the app builds a CostIntent and hands it to
// `IntegrationCostControlService.checkAndCall(intent)`. The service runs a
// deterministic decision tree (feature flag -> idempotency -> cache ->
// override -> hard cap -> soft cap -> lead score -> rate limit -> manual
// approval), reserves a row in `integration_cost_events`, runs the adapter
// via the supplied `execute` callback, then records actual cost.

export type CostActor = 'user' | 'system' | 'worker';

export interface CostContext {
  accountId: string;
  leadId?: string;
  propertyId?: string;
  dealId?: string;
  campaignId?: string;
  automationRunId?: string;
  actor: CostActor;
  userId?: string;
}

export interface CostIntentHints {
  /** Override the pricing-table lookup (use sparingly). */
  estimatedCostOverrideUsd?: number;
  /** Lead score (0-100). When provided, gates spend by configured thresholds. */
  leadScore?: number;
  /** Skip the response cache lookup. */
  skipCache?: boolean;
  /** Skip budget enforcement (admin role only — verified by caller). */
  skipBudget?: boolean;
  /** Idempotency key used to dedup repeat calls within a short window. */
  idempotencyKey?: string;
  /**
   * Suggested cache TTL for successful responses in seconds. If omitted
   * the cost-control service falls back to the per-action default table.
   */
  cacheTtlSec?: number;
  /** Workflow name for workflow-scoped budget buckets ('skip_trace_pipeline', etc.). */
  workflow?: string;
}

export interface CostIntent<TPayload = unknown, TResult = unknown> {
  provider: string;
  action: string;
  payload: TPayload;
  context: CostContext;
  hints?: CostIntentHints;
  /**
   * Adapter dispatch. Receives the resolved provider key (which may differ
   * from `intent.provider` when a fallback fires) and returns the raw
   * provider response. The cost-control service times this call and writes
   * the actual cost in `recordActual`.
   */
  execute: (resolved: { provider: string }) => Promise<TResult>;
  /**
   * Optional cost extractor for providers that meter by tokens / segments
   * and only know the exact cost after the response. Defaults to the
   * pricing-table estimate.
   */
  computeActualCostUsd?: (result: TResult) => number;
}

export type CostDecision =
  | { kind: 'ALLOW'; reservationId: string; estimatedCostUsd: number; resolvedProvider: string }
  | { kind: 'ALLOW_WITH_WARNING'; reservationId: string; estimatedCostUsd: number; resolvedProvider: string; reason: string }
  | { kind: 'ALLOW_WITH_OVERRIDE'; reservationId: string; estimatedCostUsd: number; resolvedProvider: string; overrideId: string }
  | { kind: 'USE_CACHE'; cachedResponse: unknown; cachedAt: Date; resolvedProvider: string }
  | { kind: 'DOWNGRADE_PROVIDER'; suggestedProvider: string; reason: string }
  | { kind: 'QUEUE_UNTIL_NEXT_BUDGET_PERIOD'; retryAt: Date; reason: string }
  | { kind: 'REQUIRE_MANUAL_APPROVAL'; approvalRequestId: string; reason: string }
  | { kind: 'BLOCK_OVER_BUDGET'; bucket: string; spent: number; cap: number }
  | { kind: 'BLOCK_LOW_LEAD_SCORE'; leadScore: number; threshold: number }
  | { kind: 'BLOCK_DUPLICATE_CALL'; previousCallAt: Date }
  | { kind: 'BLOCK_FEATURE_DISABLED'; flag: string };

export type AllowDecisionKind =
  | 'ALLOW'
  | 'ALLOW_WITH_WARNING'
  | 'ALLOW_WITH_OVERRIDE';

export interface RecordActualParams {
  actualCostUsd: number;
  durationMs: number;
  responseCode?: number;
  status: 'ok' | 'error' | 'rate_limited';
  metadata?: Record<string, unknown>;
  cacheKey?: string;
  cacheTtlSec?: number;
  cachePayload?: unknown;
}

export interface CheckAndCallSuccess<R> {
  decision: Extract<CostDecision, { kind: AllowDecisionKind | 'USE_CACHE' | 'DOWNGRADE_PROVIDER' }>;
  result: R;
  actualCostUsd: number;
  reservationId?: string;
  fromCache: boolean;
}

export interface CheckAndCallBlocked {
  decision: Exclude<CostDecision, { kind: AllowDecisionKind | 'USE_CACHE' | 'DOWNGRADE_PROVIDER' }>;
  result: null;
  actualCostUsd: 0;
  reservationId?: undefined;
  fromCache: false;
}

export type CheckAndCallResult<R> = CheckAndCallSuccess<R> | CheckAndCallBlocked;

/**
 * Thrown when an Allow-class decision is blocked by a downstream caller.
 * Lets adapters surface a hard refusal that's typed against the union.
 */
export class CostControlBlockedError extends Error {
  constructor(public readonly decision: CheckAndCallBlocked['decision']) {
    super(`cost_control:${decision.kind}`);
    this.name = 'CostControlBlockedError';
  }
}
