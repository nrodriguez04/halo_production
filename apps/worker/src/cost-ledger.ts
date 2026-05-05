// Worker-side cost ledger helper.
//
// The api owns the full IntegrationCostControlService (decision tree,
// rate-limit, fallback, cache). The worker historically made paid calls
// directly via raw fetch, which means those calls never appeared in the
// unified `integration_cost_events` ledger.
//
// To close the gap without taking on a cross-app NestJS DI refactor, the
// worker uses this helper to record a "best-effort" cost event after each
// successful or failed paid call. It debits the matching budget bucket so
// caps stay enforced. Preflight policy (lead score, manual approval) is
// not run here - the worker is expected to call cost-aware paths via the
// api's HTTP endpoints when a hard preflight is required.
//
// Long-term plan: migrate worker enrichment to call the api over HTTP, at
// which point this helper becomes unnecessary.

import { randomUUID } from 'crypto';
import { prisma } from './prisma-client';

export interface WorkerCostEntry {
  accountId: string;
  providerKey: string;
  action: string;
  costUsd: number;
  status: 'completed' | 'errored';
  durationMs?: number;
  responseCode?: number;
  leadId?: string;
  propertyId?: string;
  dealId?: string;
  campaignId?: string;
  automationRunId?: string;
  metadata?: Record<string, unknown>;
}

export async function recordWorkerCost(entry: WorkerCostEntry): Promise<void> {
  if (!entry.accountId || entry.accountId === 'system') {
    // Match the api invariant - cost events must be attributable to a real account.
    console.warn(
      `[worker cost-ledger] skipping cost event for ${entry.providerKey}/${entry.action}: missing accountId`,
    );
    return;
  }

  try {
    const provider = await prisma.integrationProvider.findUnique({
      where: { key: entry.providerKey },
    });
    if (!provider) {
      console.warn(`[worker cost-ledger] unknown provider ${entry.providerKey}`);
      return;
    }

    // Find the budget buckets that should have been debited. We only debit
    // the "global" + matching provider buckets; lead/campaign-scoped
    // buckets aren't enforced for raw-fetch worker calls.
    const buckets = await prisma.integrationBudgetBucket.findMany({
      where: {
        accountId: { in: [entry.accountId, 'GLOBAL'] },
        enabled: true,
        OR: [
          { scope: 'global', scopeRef: 'ALL' },
          { scope: 'provider', scopeRef: entry.providerKey },
        ],
      },
    });

    await prisma.integrationCostEvent.create({
      data: {
        accountId: entry.accountId,
        providerId: provider.id,
        providerKey: entry.providerKey,
        action: entry.action,
        reservationId: randomUUID(),
        estimatedCostUsd: entry.costUsd,
        actualCostUsd: entry.costUsd,
        status: entry.status,
        decision: 'WORKER_DIRECT',
        durationMs: entry.durationMs,
        responseCode: entry.responseCode,
        leadId: entry.leadId,
        propertyId: entry.propertyId,
        dealId: entry.dealId,
        campaignId: entry.campaignId,
        automationRunId: entry.automationRunId,
        actor: 'worker',
        bucketIds: buckets.map((b) => b.id),
        completedAt: new Date(),
        metadata: (entry.metadata ?? undefined) as object | undefined,
      },
    });

    if (buckets.length > 0 && entry.costUsd !== 0) {
      await prisma.integrationBudgetBucket.updateMany({
        where: { id: { in: buckets.map((b) => b.id) } },
        data: { currentSpendUsd: { increment: entry.costUsd } },
      });
    }
  } catch (err) {
    console.error('[worker cost-ledger] failed to record cost:', err);
  }
}

/**
 * Returns true if the global or provider monthly bucket has already
 * exceeded its hard cap. Worker callers can short-circuit before making
 * a paid call; matches the cost-control service's BLOCK_OVER_BUDGET
 * decision in spirit (without rate limits / fallbacks).
 */
export async function isOverHardCap(
  accountId: string,
  providerKey: string,
): Promise<boolean> {
  const buckets = await prisma.integrationBudgetBucket.findMany({
    where: {
      accountId: { in: [accountId, 'GLOBAL'] },
      enabled: true,
      OR: [
        { scope: 'global', scopeRef: 'ALL' },
        { scope: 'provider', scopeRef: providerKey },
      ],
    },
  });
  return buckets.some((b) => b.currentSpendUsd >= b.hardCapUsd);
}
