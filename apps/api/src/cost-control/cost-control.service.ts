import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { AggregatorService } from './aggregator.service';
import { AlertsService } from './alerts.service';
import { BudgetService, ApplicableBucket } from './budget.service';
import { ResponseCacheService } from './cache/response-cache.service';
import {
  CheckAndCallBlocked,
  CheckAndCallResult,
  CheckAndCallSuccess,
  CostDecision,
  CostIntent,
  RecordActualParams,
} from './dto/cost-intent.dto';
import { hasFallback, nextFallback } from './policy/fallback-chain';
import { defaultCacheTtlSec } from './policy/cache-ttl';
import { thresholdFor } from './policy/lead-score-thresholds';
import { PricingService } from './pricing/pricing.service';
import { RateLimitService } from './rate-limit/rate-limit.service';

// Configurable defaults — env-overridable so a single VPS deploy can
// tune the thresholds without code changes.
const MANUAL_APPROVAL_THRESHOLD_USD = Number(
  process.env.COST_CONTROL_MANUAL_APPROVAL_USD || '5',
);
const IDEMPOTENCY_WINDOW_SEC = Number(
  process.env.COST_CONTROL_IDEMPOTENCY_WINDOW_SEC || '60',
);

interface ProviderRow {
  id: string;
  key: string;
  enabled: boolean;
  rateLimitPerMin: number | null;
}

// Tiny LRU-ish bounded map: prevents the in-memory caches from growing
// unboundedly on a long-lived process if a tenant cycles through many
// distinct providers. Inserts past the limit evict the oldest entry.
class BoundedCache<V> {
  private map = new Map<string, { value: V; expiresAt: number }>();
  constructor(private readonly maxEntries: number) {}
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  set(key: string, value: V, ttlMs: number) {
    if (this.map.size >= this.maxEntries) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
  delete(key: string) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
}

// Sentinel for "no row" so we still cache the negative answer without
// re-hitting Postgres on every paid call (the common case).
const NO_TENANT_FLAG = Symbol('NO_TENANT_FLAG');
type TenantFlagCacheValue = { enabled: boolean; flag: string } | typeof NO_TENANT_FLAG;

@Injectable()
export class IntegrationCostControlService {
  private readonly logger = new Logger(IntegrationCostControlService.name);

  constructor(
    private prisma: PrismaService,
    private pricing: PricingService,
    private budgets: BudgetService,
    private cache: ResponseCacheService,
    private rateLimit: RateLimitService,
    private aggregator: AggregatorService,
    private alerts: AlertsService,
  ) {}

  /**
   * Build a CostIntent, run the decision tree, dispatch the adapter, and
   * record the actual cost. The single chokepoint that every paid call
   * in the system flows through.
   */
  async checkAndCall<P, R>(intent: CostIntent<P, R>): Promise<CheckAndCallResult<R>> {
    const triedProviders = new Set<string>();
    return this.checkAndCallInner(intent, triedProviders);
  }

  private async checkAndCallInner<P, R>(
    intent: CostIntent<P, R>,
    triedProviders: Set<string>,
  ): Promise<CheckAndCallResult<R>> {
    triedProviders.add(intent.provider);

    const decision = await this.preflight(intent);

    switch (decision.kind) {
      case 'BLOCK_FEATURE_DISABLED':
      case 'BLOCK_DUPLICATE_CALL':
      case 'BLOCK_OVER_BUDGET':
      case 'BLOCK_LOW_LEAD_SCORE':
      case 'QUEUE_UNTIL_NEXT_BUDGET_PERIOD':
      case 'REQUIRE_MANUAL_APPROVAL':
        return blocked(decision);

      case 'USE_CACHE': {
        // Cache hit: skip the network call but still record an event so
        // dashboards can attribute the saved cost.
        await this.recordCacheHit(intent, decision);
        return {
          decision,
          result: decision.cachedResponse as R,
          actualCostUsd: 0,
          fromCache: true,
        };
      }

      case 'DOWNGRADE_PROVIDER': {
        const fallback: CostIntent<P, R> = {
          ...intent,
          provider: decision.suggestedProvider,
        };
        return this.checkAndCallInner(fallback, triedProviders);
      }

      case 'ALLOW':
      case 'ALLOW_WITH_WARNING':
      case 'ALLOW_WITH_OVERRIDE':
        return this.runAndRecord(intent, decision);
    }
  }

  /**
   * Decision tree. Pure-ish: the only side effects are the reservation
   * row, idempotency mark, and rate-limit token consumption — all of
   * which are reverted/credited if the call ultimately fails.
   */
  async preflight<P>(intent: CostIntent<P, unknown>): Promise<CostDecision> {
    if (!intent.context.accountId || intent.context.accountId === 'system') {
      throw new Error('CostIntent.context.accountId is required and must not be "system"');
    }

    // 1. Provider feature flag (registry + tenant override)
    const provider = await this.findProvider(intent.provider);
    if (!provider || !provider.enabled) {
      return { kind: 'BLOCK_FEATURE_DISABLED', flag: `provider.${intent.provider}` };
    }
    const tenantFlag = await this.findTenantFlag(
      intent.context.accountId,
      `provider.${intent.provider}`,
    );
    if (tenantFlag && !tenantFlag.enabled) {
      return { kind: 'BLOCK_FEATURE_DISABLED', flag: tenantFlag.flag };
    }

    // 2. Idempotency / dedup
    if (intent.hints?.idempotencyKey) {
      const prev = await this.rateLimit.checkDuplicate(
        `${intent.context.accountId}:${intent.hints.idempotencyKey}`,
        IDEMPOTENCY_WINDOW_SEC,
      );
      if (prev) return { kind: 'BLOCK_DUPLICATE_CALL', previousCallAt: prev };
    }

    // 3. Cache lookup
    const cacheKey = this.cache.buildKey(intent.provider, intent.action, intent.payload);
    if (!intent.hints?.skipCache) {
      const cached = await this.cache.lookup(intent.context.accountId, intent.provider, cacheKey);
      if (cached) {
        return { kind: 'USE_CACHE', cachedResponse: cached.payload, cachedAt: cached.fetchedAt, resolvedProvider: intent.provider };
      }
    }

    // 4. Estimate cost
    const estimatedCost =
      intent.hints?.estimatedCostOverrideUsd ??
      (await this.pricing.estimate(intent.provider, intent.action, intent.payload));

    // 5. Manual override
    if (intent.context.leadId || intent.context.campaignId) {
      const override = await this.findActiveOverride(intent);
      if (override && override.extraBudgetUsd >= estimatedCost && !intent.hints?.skipBudget) {
        const reservationId = await this.reserve(intent, estimatedCost, [], 'ALLOW_WITH_OVERRIDE', cacheKey);
        return {
          kind: 'ALLOW_WITH_OVERRIDE',
          reservationId,
          estimatedCostUsd: estimatedCost,
          resolvedProvider: intent.provider,
          overrideId: override.id,
        };
      }
    }

    // 6. Budget caps (collected, then evaluated)
    const buckets = intent.hints?.skipBudget
      ? []
      : await this.budgets.findApplicable(intent);

    if (!intent.hints?.skipBudget) {
      const overHard = this.budgets.findOverHardCap(buckets, estimatedCost);
      if (overHard) {
        if (hasFallback(intent.provider)) {
          const candidate = nextFallback(intent.provider, new Set([intent.provider]));
          if (candidate) {
            return {
              kind: 'DOWNGRADE_PROVIDER',
              suggestedProvider: candidate,
              reason: `${overHard.scope}/${overHard.scopeRef} hard cap exceeded`,
            };
          }
        }
        return {
          kind: 'BLOCK_OVER_BUDGET',
          bucket: `${overHard.scope}/${overHard.scopeRef}`,
          spent: overHard.currentSpendUsd,
          cap: overHard.hardCapUsd,
        };
      }
    }

    // 7. Lead-score gate
    if (intent.context.leadId && intent.hints?.leadScore !== undefined) {
      const t = thresholdFor(intent.provider, intent.action);
      const meta = (intent.payload as Record<string, unknown> | undefined) ?? {};
      const expectedRoi = (meta.expectedRoiUsd as number | undefined) ?? Infinity;
      if (
        intent.hints.leadScore < t.minScore ||
        (t.minExpectedRoiUsd !== undefined && expectedRoi < t.minExpectedRoiUsd)
      ) {
        return { kind: 'BLOCK_LOW_LEAD_SCORE', leadScore: intent.hints.leadScore, threshold: t.minScore };
      }
    }

    // 8. Rate limit (Redis token bucket)
    if (provider.rateLimitPerMin) {
      const decision = await this.rateLimit.tryConsume({
        providerKey: intent.provider,
        windowSec: 60,
        maxRequests: provider.rateLimitPerMin,
        accountId: intent.context.accountId,
        scope: 'per_account',
      });
      if (!decision.allowed) {
        return {
          kind: 'QUEUE_UNTIL_NEXT_BUDGET_PERIOD',
          retryAt: decision.retryAt ?? new Date(Date.now() + 60_000),
          reason: 'rate_limited',
        };
      }
    }

    // 9. Manual-approval threshold (only for non-user actors)
    if (estimatedCost > MANUAL_APPROVAL_THRESHOLD_USD && intent.context.actor !== 'user') {
      // Reservation row in 'reserved' state with REQUIRE_MANUAL_APPROVAL decision -
      // surfaced in the admin queue. An approver re-runs with hints.skipBudget.
      const reservationId = await this.reserve(intent, estimatedCost, buckets.map((b) => b.id), 'REQUIRE_MANUAL_APPROVAL', cacheKey);
      return {
        kind: 'REQUIRE_MANUAL_APPROVAL',
        approvalRequestId: reservationId,
        reason: `estimated cost ${estimatedCost.toFixed(4)} exceeds threshold ${MANUAL_APPROVAL_THRESHOLD_USD}`,
      };
    }

    // 10. ALLOW (with optional soft-cap warning)
    const overSoft = this.budgets.findOverSoftCap(buckets, estimatedCost);
    const reservationId = await this.reserve(
      intent,
      estimatedCost,
      buckets.map((b) => b.id),
      overSoft ? 'ALLOW_WITH_WARNING' : 'ALLOW',
      cacheKey,
    );
    if (overSoft) {
      return {
        kind: 'ALLOW_WITH_WARNING',
        reservationId,
        estimatedCostUsd: estimatedCost,
        resolvedProvider: intent.provider,
        reason: `${overSoft.scope}/${overSoft.scopeRef} at ${Math.round((overSoft.currentSpendUsd + estimatedCost) / overSoft.hardCapUsd * 100)}% of cap`,
      };
    }
    return { kind: 'ALLOW', reservationId, estimatedCostUsd: estimatedCost, resolvedProvider: intent.provider };
  }

  async recordActual(reservationId: string, p: RecordActualParams): Promise<void> {
    const event = await this.prisma.integrationCostEvent.findUnique({ where: { reservationId } });
    if (!event) {
      this.logger.warn(`recordActual: reservation ${reservationId} not found`);
      return;
    }

    const status = p.status === 'ok' ? 'completed' : p.status === 'rate_limited' ? 'errored' : 'errored';
    const mergedMetadata = mergeJson(event.metadata, p.metadata);
    const updated = await this.prisma.integrationCostEvent.update({
      where: { reservationId },
      data: {
        actualCostUsd: p.actualCostUsd,
        durationMs: p.durationMs,
        responseCode: p.responseCode,
        status,
        completedAt: new Date(),
        metadata: mergedMetadata as object | undefined,
      },
    });

    const delta = p.actualCostUsd - event.estimatedCostUsd;
    if (event.bucketIds.length > 0 && delta !== 0) {
      await this.budgets.debit(event.bucketIds, delta);
    }

    await this.aggregator.bump({
      accountId: updated.accountId,
      providerKey: updated.providerKey,
      action: updated.action,
      when: updated.completedAt ?? new Date(),
      actualCostUsd: p.actualCostUsd,
      status: status === 'completed' ? 'completed' : 'errored',
    });

    if (p.status === 'ok' && p.cachePayload !== undefined) {
      const ttl = p.cacheTtlSec ?? defaultCacheTtlSec(updated.providerKey, updated.action);
      if (ttl > 0 && p.cacheKey) {
        await this.cache.write({
          accountId: updated.accountId,
          providerKey: updated.providerKey,
          cacheKey: p.cacheKey,
          payload: p.cachePayload,
          ttlSec: ttl,
          responseCode: p.responseCode,
        });
      }
    }

    await this.alerts.evaluate({
      accountId: updated.accountId,
      bucketIds: event.bucketIds,
      deltaUsd: p.actualCostUsd,
    });
  }

  /** For probes / admin views. Returns a snapshot without side effects. */
  async getBucketStatus(
    accountId: string,
    scope: string,
    scopeRef: string,
    period: 'day' | 'week' | 'month',
  ) {
    const row = await this.prisma.integrationBudgetBucket.findFirst({
      where: { accountId, scope, scopeRef, period, enabled: true },
      orderBy: { periodStartedAt: 'desc' },
    });
    if (!row) return null;
    return {
      currentSpendUsd: row.currentSpendUsd,
      hardCapUsd: row.hardCapUsd,
      softCapUsd: row.softCapUsd,
      periodResetsAt: row.periodResetsAt,
      ratio: row.currentSpendUsd / row.hardCapUsd,
    };
  }

  // -- Internals --------------------------------------------------------

  private async runAndRecord<P, R>(
    intent: CostIntent<P, R>,
    decision: Extract<CostDecision, { kind: 'ALLOW' | 'ALLOW_WITH_WARNING' | 'ALLOW_WITH_OVERRIDE' }>,
  ): Promise<CheckAndCallSuccess<R>> {
    const startedAt = Date.now();
    let result: R;
    try {
      result = await intent.execute({ provider: decision.resolvedProvider });
    } catch (err) {
      await this.recordActual(decision.reservationId, {
        actualCostUsd: 0,
        durationMs: Date.now() - startedAt,
        status: 'error',
        metadata: { error: (err as Error).message },
      });
      throw err;
    }
    const durationMs = Date.now() - startedAt;
    const actualCost = intent.computeActualCostUsd
      ? intent.computeActualCostUsd(result)
      : decision.estimatedCostUsd;

    const cacheKey = this.cache.buildKey(intent.provider, intent.action, intent.payload);
    await this.recordActual(decision.reservationId, {
      actualCostUsd: actualCost,
      durationMs,
      status: 'ok',
      cacheKey,
      cachePayload: result,
    });

    return {
      decision,
      result,
      actualCostUsd: actualCost,
      reservationId: decision.reservationId,
      fromCache: false,
    };
  }

  private async recordCacheHit<P, R>(
    intent: CostIntent<P, R>,
    decision: Extract<CostDecision, { kind: 'USE_CACHE' }>,
  ): Promise<void> {
    try {
      const provider = await this.findProvider(intent.provider);
      if (!provider) return;

      const estimated = await this.pricing.estimate(intent.provider, intent.action, intent.payload);
      await this.prisma.integrationCostEvent.create({
        data: {
          accountId: intent.context.accountId,
          providerId: provider.id,
          providerKey: intent.provider,
          action: intent.action,
          reservationId: randomUUID(),
          estimatedCostUsd: estimated,
          actualCostUsd: 0,
          status: 'cache_hit',
          decision: 'USE_CACHE',
          leadId: intent.context.leadId,
          propertyId: intent.context.propertyId,
          dealId: intent.context.dealId,
          campaignId: intent.context.campaignId,
          automationRunId: intent.context.automationRunId,
          actor: intent.context.actor,
          userId: intent.context.userId,
          bucketIds: [],
          idempotencyKey: intent.hints?.idempotencyKey,
          completedAt: new Date(),
          metadata: { cachedAt: decision.cachedAt.toISOString() },
        },
      });
      const cacheKey = this.cache.buildKey(intent.provider, intent.action, intent.payload);
      await this.cache.recordHit(intent.context.accountId, intent.provider, cacheKey, estimated);
      await this.aggregator.bump({
        accountId: intent.context.accountId,
        providerKey: intent.provider,
        action: intent.action,
        when: new Date(),
        actualCostUsd: 0,
        status: 'cache_hit',
        costSavedUsd: estimated,
      });
    } catch (err) {
      this.logger.warn(`cache hit record failed: ${err}`);
    }
  }

  private async reserve<P>(
    intent: CostIntent<P, unknown>,
    estimatedCost: number,
    bucketIds: string[],
    decision: string,
    _cacheKey: string,
  ): Promise<string> {
    const provider = await this.findProvider(intent.provider);
    if (!provider) throw new Error(`unknown provider ${intent.provider}`);
    const reservationId = randomUUID();
    await this.prisma.integrationCostEvent.create({
      data: {
        accountId: intent.context.accountId,
        providerId: provider.id,
        providerKey: intent.provider,
        action: intent.action,
        reservationId,
        estimatedCostUsd: estimatedCost,
        status: 'reserved',
        decision,
        leadId: intent.context.leadId,
        propertyId: intent.context.propertyId,
        dealId: intent.context.dealId,
        campaignId: intent.context.campaignId,
        automationRunId: intent.context.automationRunId,
        actor: intent.context.actor,
        userId: intent.context.userId,
        bucketIds,
        idempotencyKey: intent.hints?.idempotencyKey,
      },
    });
    if (bucketIds.length > 0) {
      // Optimistic debit (against the *estimate*); recordActual replays the
      // delta once the true cost is known.
      await this.budgets.debit(bucketIds, estimatedCost);
    }
    return reservationId;
  }

  private providerCache = new BoundedCache<ProviderRow>(64);
  private tenantFlagCache = new BoundedCache<TenantFlagCacheValue>(2048);
  // "does this account have ANY unconsumed, unexpired overrides?"
  // Active overrides are rare (manual admin action). Caching a negative
  // answer per-account skips a `manualBudgetOverride.findFirst` per
  // every paid call that has a leadId/campaignId/workflow hint.
  private hasOverridesCache = new BoundedCache<boolean>(2048);

  private async findProvider(key: string): Promise<ProviderRow | null> {
    const hit = this.providerCache.get(key);
    if (hit) return hit;
    const row = await this.prisma.integrationProvider.findUnique({ where: { key } });
    if (!row) return null;
    const trimmed: ProviderRow = {
      id: row.id,
      key: row.key,
      enabled: row.enabled,
      rateLimitPerMin: row.rateLimitPerMin,
    };
    this.providerCache.set(key, trimmed, 30_000);
    return trimmed;
  }

  /**
   * Tenant feature-flag lookup with a 30s in-memory cache. Negative
   * answers (no row for this account+flag) are cached too via
   * `NO_TENANT_FLAG` to avoid hammering Postgres for the common case
   * where a tenant has not customized any provider toggle.
   *
   * Cache is invalidated on every flag write (`invalidateProviderCache`
   * is called by `cost-control.controller.ts` on toggle).
   */
  private async findTenantFlag(
    accountId: string,
    flag: string,
  ): Promise<{ enabled: boolean; flag: string } | null> {
    const key = `${accountId}:${flag}`;
    const hit = this.tenantFlagCache.get(key);
    if (hit !== undefined) return hit === NO_TENANT_FLAG ? null : hit;
    const row = await this.prisma.integrationFeatureFlag.findUnique({
      where: { accountId_flag: { accountId, flag } },
    });
    if (!row) {
      this.tenantFlagCache.set(key, NO_TENANT_FLAG, 30_000);
      return null;
    }
    const trimmed = { enabled: row.enabled, flag: row.flag };
    this.tenantFlagCache.set(key, trimmed, 30_000);
    return trimmed;
  }

  /** Drop the in-memory provider + tenant-flag caches. Called by admin
   * toggle endpoints so a flip takes effect on the very next call. */
  invalidateProviderCache() {
    this.providerCache.clear();
    this.tenantFlagCache.clear();
    this.pricing.invalidateCache();
  }

  /** Drop the per-account "has overrides?" cache. Called when an admin
   * creates or consumes a `ManualBudgetOverride`. */
  invalidateOverrideCache(accountId: string) {
    this.hasOverridesCache.delete(accountId);
  }

  private async findActiveOverride<P>(intent: CostIntent<P, unknown>) {
    const ctx = intent.context;
    const orFilters: { scope: string; scopeRef: string }[] = [];
    if (ctx.leadId) orFilters.push({ scope: 'lead', scopeRef: ctx.leadId });
    if (ctx.campaignId) orFilters.push({ scope: 'campaign', scopeRef: ctx.campaignId });
    if (intent.hints?.workflow) orFilters.push({ scope: 'workflow', scopeRef: intent.hints.workflow });
    if (orFilters.length === 0) return null;

    // Fast path: most accounts have zero active overrides at any given
    // moment. Cache the boolean answer and skip the OR-filter lookup
    // entirely until cache expiry or an admin creates a new override.
    const hasAny = await this.accountHasActiveOverrides(ctx.accountId);
    if (!hasAny) return null;

    return this.prisma.manualBudgetOverride.findFirst({
      where: {
        accountId: ctx.accountId,
        consumed: false,
        expiresAt: { gt: new Date() },
        OR: orFilters,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async accountHasActiveOverrides(accountId: string): Promise<boolean> {
    const hit = this.hasOverridesCache.get(accountId);
    if (hit !== undefined) return hit;
    const count = await this.prisma.manualBudgetOverride.count({
      where: {
        accountId,
        consumed: false,
        expiresAt: { gt: new Date() },
      },
    });
    const hasAny = count > 0;
    // Negative cache TTL = 60s. Positive cache TTL = 5s so a freshly
    // consumed override stops being matched quickly.
    this.hasOverridesCache.set(accountId, hasAny, hasAny ? 5_000 : 60_000);
    return hasAny;
  }
}

function blocked(decision: CostDecision): CheckAndCallBlocked {
  return {
    decision: decision as CheckAndCallBlocked['decision'],
    result: null,
    actualCostUsd: 0,
    fromCache: false,
  };
}

function mergeJson(
  base: unknown,
  extra: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const baseObj = (base && typeof base === 'object' && !Array.isArray(base) ? (base as Record<string, unknown>) : {});
  if (!extra && Object.keys(baseObj).length === 0) return undefined;
  return { ...baseObj, ...(extra ?? {}) };
}
