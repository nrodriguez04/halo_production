import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { AggregatorService } from '../aggregator.service';
import { AlertsService } from '../alerts.service';
import { BudgetService } from '../budget.service';
import { ResponseCacheService } from '../cache/response-cache.service';
import { IntegrationCostControlService } from '../cost-control.service';
import { CostIntent } from '../dto/cost-intent.dto';
import { PricingService } from '../pricing/pricing.service';
import { RateLimitService } from '../rate-limit/rate-limit.service';

// Tests every branch of preflight + checkAndCall: ALLOW, ALLOW_WITH_WARNING,
// USE_CACHE, DOWNGRADE_PROVIDER, BLOCK_FEATURE_DISABLED, BLOCK_OVER_BUDGET,
// BLOCK_LOW_LEAD_SCORE, BLOCK_DUPLICATE_CALL, QUEUE_UNTIL_NEXT_BUDGET_PERIOD,
// REQUIRE_MANUAL_APPROVAL, ALLOW_WITH_OVERRIDE.
//
// Mocks the entire data layer so we can drive every decision deterministically.

const baseIntent = (over: Partial<CostIntent<unknown, unknown>> = {}): CostIntent<unknown, { ok: true }> => ({
  provider: 'attom',
  action: 'property_expanded_profile',
  payload: { address: '1 Main St' },
  context: { accountId: 'acc_1', actor: 'system' },
  execute: jest.fn(async () => ({ ok: true })) as any,
  ...over,
});

describe('IntegrationCostControlService', () => {
  let service: IntegrationCostControlService;
  let prisma: any;
  let pricing: any;
  let budgets: any;
  let cache: any;
  let rateLimit: any;
  let aggregator: any;
  let alerts: any;

  beforeEach(async () => {
    prisma = {
      integrationProvider: { findUnique: jest.fn() },
      integrationFeatureFlag: { findUnique: jest.fn().mockResolvedValue(null) },
      integrationCostEvent: {
        create: jest.fn(async (args: any) => ({ ...args.data })),
        update: jest.fn(async (args: any) => ({ ...args.data, accountId: 'acc_1', providerKey: 'attom', action: 'property_expanded_profile', completedAt: new Date(), bucketIds: [] })),
        findUnique: jest.fn(),
      },
      integrationBudgetBucket: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      manualBudgetOverride: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(1),
      },
    };

    pricing = {
      estimate: jest.fn().mockResolvedValue(0.1),
      invalidateCache: jest.fn(),
    };
    budgets = {
      findApplicable: jest.fn().mockResolvedValue([]),
      findOverHardCap: jest.fn().mockReturnValue(null),
      findOverSoftCap: jest.fn().mockReturnValue(null),
      debit: jest.fn().mockResolvedValue(undefined),
    };
    cache = {
      buildKey: jest.fn().mockReturnValue('cachekey-1'),
      lookup: jest.fn().mockResolvedValue(null),
      write: jest.fn().mockResolvedValue(undefined),
      recordHit: jest.fn().mockResolvedValue(undefined),
    };
    rateLimit = {
      tryConsume: jest.fn().mockResolvedValue({ allowed: true, remaining: 99 }),
      checkDuplicate: jest.fn().mockResolvedValue(null),
    };
    aggregator = { bump: jest.fn().mockResolvedValue(undefined) };
    alerts = { evaluate: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegrationCostControlService,
        { provide: PrismaService, useValue: prisma },
        { provide: PricingService, useValue: pricing },
        { provide: BudgetService, useValue: budgets },
        { provide: ResponseCacheService, useValue: cache },
        { provide: RateLimitService, useValue: rateLimit },
        { provide: AggregatorService, useValue: aggregator },
        { provide: AlertsService, useValue: alerts },
      ],
    }).compile();

    service = module.get<IntegrationCostControlService>(IntegrationCostControlService);

    // Default provider — ATTOM, enabled, with rate limit
    prisma.integrationProvider.findUnique.mockImplementation(async (args: any) => {
      if (args.where.key === 'attom') return { id: 'p_attom', key: 'attom', enabled: true, rateLimitPerMin: 60 };
      if (args.where.key === 'propertyradar') return { id: 'p_pr', key: 'propertyradar', enabled: true, rateLimitPerMin: 60 };
      if (args.where.key === 'rentcast') return { id: 'p_rc', key: 'rentcast', enabled: true, rateLimitPerMin: 120 };
      if (args.where.key === 'batch_skiptrace') return { id: 'p_bst', key: 'batch_skiptrace', enabled: true, rateLimitPerMin: null };
      return null;
    });

    // Default reservation lookup
    prisma.integrationCostEvent.findUnique.mockResolvedValue({
      reservationId: 'res-1',
      accountId: 'acc_1',
      providerKey: 'attom',
      action: 'property_expanded_profile',
      estimatedCostUsd: 0.1,
      bucketIds: [],
      metadata: null,
    });
  });

  it('rejects intents missing accountId', async () => {
    const intent = baseIntent({ context: { accountId: '', actor: 'system' } as any });
    await expect(service.preflight(intent)).rejects.toThrow(/accountId/);
  });

  it('blocks when provider feature flag is disabled at registry', async () => {
    prisma.integrationProvider.findUnique.mockResolvedValueOnce({ id: 'p_attom', key: 'attom', enabled: false, rateLimitPerMin: 60 });
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('BLOCK_FEATURE_DISABLED');
  });

  it('blocks when tenant feature flag overrides registry off', async () => {
    prisma.integrationFeatureFlag.findUnique.mockResolvedValueOnce({ enabled: false, flag: 'provider.attom' });
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('BLOCK_FEATURE_DISABLED');
  });

  it('blocks duplicate calls when idempotency key has been seen', async () => {
    rateLimit.checkDuplicate.mockResolvedValueOnce(new Date('2026-04-01T00:00:00Z'));
    const decision = await service.preflight(
      baseIntent({ hints: { idempotencyKey: 'lead-1:attom' } }),
    );
    expect(decision.kind).toBe('BLOCK_DUPLICATE_CALL');
  });

  it('returns USE_CACHE when a fresh cached response exists', async () => {
    cache.lookup.mockResolvedValueOnce({
      payload: { cachedOk: true },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('USE_CACHE');
  });

  it('blocks when applicable bucket is over its hard cap and provider has no fallback', async () => {
    // rentcast has no fallback chain configured, so the over-budget decision
    // is BLOCK rather than DOWNGRADE.
    budgets.findApplicable.mockResolvedValueOnce([
      { id: 'b_1', scope: 'provider', scopeRef: 'rentcast', period: 'month', hardCapUsd: 100, softCapUsd: 80, currentSpendUsd: 99.95, enabled: true },
    ]);
    budgets.findOverHardCap.mockReturnValueOnce({ id: 'b_1', scope: 'provider', scopeRef: 'rentcast', period: 'month', hardCapUsd: 100, softCapUsd: 80, currentSpendUsd: 99.95, enabled: true });
    const decision = await service.preflight({
      ...baseIntent(),
      provider: 'rentcast',
      action: 'value_estimate',
    });
    expect(decision.kind).toBe('BLOCK_OVER_BUDGET');
  });

  it('returns DOWNGRADE_PROVIDER when over hard cap and provider has a fallback', async () => {
    budgets.findApplicable.mockResolvedValueOnce([
      { id: 'b_1', scope: 'provider', scopeRef: 'batch_skiptrace', period: 'month', hardCapUsd: 100, softCapUsd: 80, currentSpendUsd: 99.95, enabled: true },
    ]);
    budgets.findOverHardCap.mockReturnValueOnce({ id: 'b_1', scope: 'provider', scopeRef: 'batch_skiptrace', period: 'month', hardCapUsd: 100, softCapUsd: 80, currentSpendUsd: 99.95, enabled: true });
    const decision = await service.preflight({
      ...baseIntent(),
      provider: 'batch_skiptrace',
      action: 'append_contacts',
    });
    expect(decision.kind).toBe('DOWNGRADE_PROVIDER');
    if (decision.kind === 'DOWNGRADE_PROVIDER') {
      expect(['datazapp', 'propertyradar']).toContain(decision.suggestedProvider);
    }
  });

  it('blocks when lead score is below the configured threshold', async () => {
    pricing.estimate.mockResolvedValue(0.1);
    const decision = await service.preflight({
      ...baseIntent(),
      provider: 'batch_skiptrace',
      action: 'append_contacts',
      payload: { expectedRoiUsd: 100 },
      context: { accountId: 'acc_1', actor: 'system', leadId: 'lead_1' },
      hints: { leadScore: 30 },
    });
    expect(decision.kind).toBe('BLOCK_LOW_LEAD_SCORE');
  });

  it('queues when rate limit token is unavailable', async () => {
    rateLimit.tryConsume.mockResolvedValueOnce({ allowed: false, retryAt: new Date(Date.now() + 30_000) });
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('QUEUE_UNTIL_NEXT_BUDGET_PERIOD');
  });

  it('requires manual approval above the configured threshold for non-user actors', async () => {
    pricing.estimate.mockResolvedValue(50);
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('REQUIRE_MANUAL_APPROVAL');
  });

  it('does not require manual approval when actor is user', async () => {
    pricing.estimate.mockResolvedValue(50);
    const decision = await service.preflight({
      ...baseIntent(),
      context: { accountId: 'acc_1', actor: 'user', userId: 'u_1' },
    });
    expect(['ALLOW', 'ALLOW_WITH_WARNING']).toContain(decision.kind);
  });

  it('returns ALLOW_WITH_WARNING when soft cap crossed', async () => {
    const overSoft = { id: 'b_1', scope: 'provider', scopeRef: 'attom', period: 'month', hardCapUsd: 100, softCapUsd: 80, currentSpendUsd: 79.95, enabled: true };
    budgets.findApplicable.mockResolvedValueOnce([overSoft]);
    budgets.findOverHardCap.mockReturnValueOnce(null);
    budgets.findOverSoftCap.mockReturnValueOnce(overSoft);
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('ALLOW_WITH_WARNING');
  });

  it('returns ALLOW_WITH_OVERRIDE when an active manual override covers the cost', async () => {
    prisma.manualBudgetOverride.findFirst.mockResolvedValueOnce({
      id: 'o_1', extraBudgetUsd: 100, expiresAt: new Date(Date.now() + 86400000),
    });
    const decision = await service.preflight({
      ...baseIntent(),
      context: { accountId: 'acc_1', actor: 'system', leadId: 'lead_1' },
    });
    expect(decision.kind).toBe('ALLOW_WITH_OVERRIDE');
  });

  it('returns ALLOW for the happy path', async () => {
    const decision = await service.preflight(baseIntent());
    expect(decision.kind).toBe('ALLOW');
  });

  it('checkAndCall executes adapter and records actual on ALLOW', async () => {
    const exec = jest.fn(async () => ({ ok: true }));
    const intent = baseIntent({ execute: exec });
    const out = await service.checkAndCall(intent);
    expect(out.fromCache).toBe(false);
    expect(out.decision.kind).toBe('ALLOW');
    expect(exec).toHaveBeenCalledTimes(1);
    expect(prisma.integrationCostEvent.update).toHaveBeenCalled();
  });

  it('checkAndCall returns cached payload without invoking adapter', async () => {
    cache.lookup.mockResolvedValueOnce({
      payload: { cachedOk: true },
      fetchedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    const exec = jest.fn(async () => ({ ok: true }));
    const out = await service.checkAndCall(baseIntent({ execute: exec }));
    expect(exec).not.toHaveBeenCalled();
    expect(out.fromCache).toBe(true);
    expect((out.result as any).cachedOk).toBe(true);
  });
});
