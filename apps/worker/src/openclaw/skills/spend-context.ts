// Reads the current AI spend / cap from the cost-governance budget
// buckets so OpenClaw skills can pass them to `aiCostCapRule`. Without
// this, AI-producing skills bypass the daily cap because the policy
// rule short-circuits when `dailySpendUsd` / `dailyCapUsd` are
// undefined.

import { prisma } from '../../prisma-client';

export interface SpendContext {
  dailySpendUsd: number;
  dailyCapUsd: number;
  perTenantCapUsd: number;
  globalDailySpendUsd: number;
  globalDailyCapUsd: number;
}

const FALLBACK_TENANT_CAP = 2;
const FALLBACK_GLOBAL_CAP = 50;

export async function loadSpendContext(tenantId: string): Promise<SpendContext> {
  const [tenantBucket, globalBucket] = await Promise.all([
    prisma.integrationBudgetBucket.findFirst({
      where: {
        accountId: tenantId,
        scope: 'provider',
        scopeRef: 'openai',
        period: 'day',
        enabled: true,
      },
      orderBy: { periodStartedAt: 'desc' },
    }),
    prisma.integrationBudgetBucket.findFirst({
      where: {
        accountId: 'GLOBAL',
        scope: 'global',
        scopeRef: 'ALL',
        period: 'day',
        enabled: true,
      },
      orderBy: { periodStartedAt: 'desc' },
    }),
  ]);

  // Fallback: if no buckets exist (cost-governance not yet seeded for
  // this tenant), use the legacy ControlPlane.aiDailyCostCap value.
  let tenantCap = tenantBucket?.hardCapUsd ?? FALLBACK_TENANT_CAP;
  let globalCap = globalBucket?.hardCapUsd ?? FALLBACK_GLOBAL_CAP;
  if (!tenantBucket || !globalBucket) {
    try {
      const cp = await prisma.controlPlane.findFirst();
      if (cp?.aiDailyCostCap) tenantCap = cp.aiDailyCostCap;
      if (cp?.apiDailyCostCap) globalCap = cp.apiDailyCostCap;
    } catch {
      // best-effort fallback
    }
  }

  return {
    dailySpendUsd: tenantBucket?.currentSpendUsd ?? 0,
    dailyCapUsd: tenantCap,
    perTenantCapUsd: tenantCap,
    globalDailySpendUsd: globalBucket?.currentSpendUsd ?? 0,
    globalDailyCapUsd: globalCap,
  };
}
