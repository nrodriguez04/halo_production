import { PrismaClient } from '@prisma/client';

// Seeds the cost-governance reference data:
//   - integration_providers (registry of every paid provider)
//   - provider_pricing_rules (rate cards)
//   - provider_rate_limits (token bucket configs)
//   - integration_budget_buckets (default monthly + daily caps)
//
// Idempotent: re-runs are safe via upsert. Budget bucket spend is NOT reset
// on re-seed - operators can adjust caps without losing accumulated spend.

const PROVIDERS = [
  // Property data
  {
    key: 'attom',
    displayName: 'ATTOM',
    category: 'property_data',
    enabled: true,
    rateLimitPerMin: 60,
    pricing: [{ action: 'property_expanded_profile', unitCostUsd: 0.1, unit: 'per_call' }],
  },
  {
    key: 'rentcast',
    displayName: 'RentCast',
    category: 'property_data',
    enabled: true,
    rateLimitPerMin: 120,
    pricing: [
      { action: 'value_estimate', unitCostUsd: 0.05, unit: 'per_call' },
      { action: 'rent_estimate', unitCostUsd: 0.05, unit: 'per_call' },
      { action: 'listings', unitCostUsd: 0.05, unit: 'per_call' },
      { action: 'property', unitCostUsd: 0.05, unit: 'per_call' },
    ],
  },
  {
    key: 'propertyradar',
    displayName: 'PropertyRadar',
    category: 'property_data',
    enabled: false, // disabled by default, behind feature flag
    rateLimitPerMin: 60,
    pricing: [
      { action: 'property_lookup', unitCostUsd: 0.02, unit: 'per_call' },
      { action: 'append_contacts', unitCostUsd: 0.1, unit: 'per_record' },
    ],
  },

  // Geocoding
  {
    key: 'google_geocoding',
    displayName: 'Google Geocoding',
    category: 'geocoding',
    enabled: true,
    rateLimitPerMin: 100,
    pricing: [
      { action: 'geocode', unitCostUsd: 0.005, unit: 'per_call' },
      { action: 'reverse_geocode', unitCostUsd: 0.005, unit: 'per_call' },
    ],
  },

  // AI
  {
    key: 'openai',
    displayName: 'OpenAI',
    category: 'ai',
    enabled: true,
    rateLimitPerMin: 200,
    pricing: [
      // Token-based pricing - the tokens-in/tokens-out are read from intent.payload
      { action: 'chat_completion.gpt-4o-mini', unitCostUsd: 0.00015, unit: 'per_1k_input_tokens' },
      { action: 'chat_completion.gpt-4o-mini', unitCostUsd: 0.0006, unit: 'per_1k_output_tokens' },
      { action: 'chat_completion.gpt-4o', unitCostUsd: 0.0025, unit: 'per_1k_input_tokens' },
      { action: 'chat_completion.gpt-4o', unitCostUsd: 0.01, unit: 'per_1k_output_tokens' },
      { action: 'chat_completion.gpt-4-turbo', unitCostUsd: 0.01, unit: 'per_1k_input_tokens' },
      { action: 'chat_completion.gpt-4-turbo', unitCostUsd: 0.03, unit: 'per_1k_output_tokens' },
    ],
  },

  // Comms
  {
    key: 'twilio',
    displayName: 'Twilio SMS',
    category: 'comms',
    enabled: true,
    pricing: [
      { action: 'send_sms.us', unitCostUsd: 0.0083, unit: 'per_segment' },
      { action: 'send_sms.toll_free', unitCostUsd: 0.0083, unit: 'per_segment' },
    ],
  },
  {
    key: 'resend',
    displayName: 'Resend',
    category: 'comms',
    enabled: true,
    pricing: [{ action: 'send_email', unitCostUsd: 0.0004, unit: 'per_call' }],
  },
  {
    key: 'smtp',
    displayName: 'SMTP (fallback)',
    category: 'comms',
    enabled: true,
    isFallbackFor: 'resend',
    pricing: [{ action: 'send_email', unitCostUsd: 0.0001, unit: 'per_call' }],
  },

  // Skip trace
  {
    key: 'batch_skiptrace',
    displayName: 'BatchSkipTracing',
    category: 'skip_trace',
    enabled: true,
    pricing: [{ action: 'append_contacts', unitCostUsd: 0.1, unit: 'per_record' }],
  },
  {
    key: 'datazapp',
    displayName: 'Datazapp',
    category: 'skip_trace',
    enabled: false, // future adapter, disabled until keys are wired
    isFallbackFor: 'batch_skiptrace',
    pricing: [{ action: 'append_contacts', unitCostUsd: 0.05, unit: 'per_record' }],
  },
  {
    key: 'stub_skiptrace',
    displayName: 'Stub SkipTrace (CI/local)',
    category: 'skip_trace',
    enabled: false, // selected via SKIP_TRACE_PROVIDER=stub env var only
    pricing: [{ action: 'append_contacts', unitCostUsd: 0, unit: 'per_record' }],
  },
] as const;

// Default budget buckets - applied to a single GLOBAL accountId-shaped row
// so the policy still enforces in single-tenant mode. When a real
// account is created the seed for that account inherits these defaults.
const BUDGET_TEMPLATES = [
  // Org-wide caps
  { scope: 'global', scopeRef: 'ALL', period: 'month', hardCapUsd: 1000, softCapUsd: 800 },
  { scope: 'global', scopeRef: 'ALL', period: 'day', hardCapUsd: 50, softCapUsd: 40 },

  // Per-provider monthly caps (sum to <= the global cap)
  { scope: 'provider', scopeRef: 'openai', period: 'month', hardCapUsd: 200, softCapUsd: 160 },
  { scope: 'provider', scopeRef: 'twilio', period: 'month', hardCapUsd: 200, softCapUsd: 160 },
  { scope: 'provider', scopeRef: 'batch_skiptrace', period: 'month', hardCapUsd: 250, softCapUsd: 200 },
  { scope: 'provider', scopeRef: 'rentcast', period: 'month', hardCapUsd: 100, softCapUsd: 80 },
  { scope: 'provider', scopeRef: 'attom', period: 'month', hardCapUsd: 150, softCapUsd: 120 },
  { scope: 'provider', scopeRef: 'google_geocoding', period: 'month', hardCapUsd: 25, softCapUsd: 20 },
  { scope: 'provider', scopeRef: 'resend', period: 'month', hardCapUsd: 20, softCapUsd: 16 },

  // Workflow caps
  { scope: 'workflow', scopeRef: 'skip_trace_pipeline', period: 'day', hardCapUsd: 25, softCapUsd: 20 },
  { scope: 'workflow', scopeRef: 'ai_underwriting', period: 'day', hardCapUsd: 10, softCapUsd: 8 },
  { scope: 'workflow', scopeRef: 'lead_enrichment', period: 'day', hardCapUsd: 15, softCapUsd: 12 },
];

export async function seedCostGovernance(prisma: PrismaClient, accountId: string) {
  console.log('Seeding cost governance...');

  // 1. Providers + pricing rules + rate limits
  for (const p of PROVIDERS) {
    const provider = await prisma.integrationProvider.upsert({
      where: { key: p.key },
      update: {
        displayName: p.displayName,
        category: p.category,
        enabled: p.enabled,
        isFallbackFor: 'isFallbackFor' in p ? (p as { isFallbackFor: string }).isFallbackFor : null,
        rateLimitPerMin: 'rateLimitPerMin' in p ? (p as { rateLimitPerMin: number }).rateLimitPerMin : null,
      },
      create: {
        key: p.key,
        displayName: p.displayName,
        category: p.category,
        enabled: p.enabled,
        isFallbackFor: 'isFallbackFor' in p ? (p as { isFallbackFor: string }).isFallbackFor : null,
        rateLimitPerMin: 'rateLimitPerMin' in p ? (p as { rateLimitPerMin: number }).rateLimitPerMin : null,
      },
    });

    // Wipe and replace pricing rules so seed is the source of truth
    await prisma.providerPricingRule.deleteMany({ where: { providerId: provider.id } });
    await prisma.providerPricingRule.createMany({
      data: p.pricing.map((r) => ({
        providerId: provider.id,
        action: r.action,
        unitCostUsd: r.unitCostUsd,
        unit: r.unit,
        pricePer: 1,
      })),
    });

    if ('rateLimitPerMin' in p && (p as { rateLimitPerMin: number }).rateLimitPerMin) {
      await prisma.providerRateLimit.upsert({
        where: {
          providerId_scope_windowSec: { providerId: provider.id, scope: 'per_account', windowSec: 60 },
        },
        update: { maxRequests: (p as { rateLimitPerMin: number }).rateLimitPerMin },
        create: {
          providerId: provider.id,
          scope: 'per_account',
          windowSec: 60,
          maxRequests: (p as { rateLimitPerMin: number }).rateLimitPerMin,
        },
      });
    }
  }
  console.log(`  ${PROVIDERS.length} providers seeded`);

  // 2. Budget buckets - one set scoped to the seed account, plus a GLOBAL set
  for (const acct of [accountId, 'GLOBAL']) {
    for (const tpl of BUDGET_TEMPLATES) {
      const { startedAt, resetsAt } = currentPeriod(tpl.period);
      await prisma.integrationBudgetBucket.upsert({
        where: {
          accountId_scope_scopeRef_period_periodStartedAt: {
            accountId: acct,
            scope: tpl.scope,
            scopeRef: tpl.scopeRef,
            period: tpl.period,
            periodStartedAt: startedAt,
          },
        },
        update: {
          hardCapUsd: tpl.hardCapUsd,
          softCapUsd: tpl.softCapUsd,
        },
        create: {
          accountId: acct,
          scope: tpl.scope,
          scopeRef: tpl.scopeRef,
          period: tpl.period,
          hardCapUsd: tpl.hardCapUsd,
          softCapUsd: tpl.softCapUsd,
          periodStartedAt: startedAt,
          periodResetsAt: resetsAt,
        },
      });
    }
  }
  console.log(`  ${BUDGET_TEMPLATES.length * 2} budget buckets seeded`);
}

function currentPeriod(period: string) {
  const now = new Date();
  const startedAt = new Date(now);
  startedAt.setHours(0, 0, 0, 0);
  if (period === 'week') {
    startedAt.setDate(startedAt.getDate() - startedAt.getDay());
  } else if (period === 'month') {
    startedAt.setDate(1);
  }
  const resetsAt = new Date(startedAt);
  if (period === 'day') resetsAt.setDate(resetsAt.getDate() + 1);
  else if (period === 'week') resetsAt.setDate(resetsAt.getDate() + 7);
  else if (period === 'month') resetsAt.setMonth(resetsAt.getMonth() + 1);
  else resetsAt.setDate(resetsAt.getDate() + 1);
  return { startedAt, resetsAt };
}
