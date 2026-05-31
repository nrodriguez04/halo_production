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

import { getExpiredBudgetBucketReset, wouldExceedHardCap } from '@halo/shared';
import type { IntegrationBudgetBucket } from '@prisma/client';
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

async function loadApplicableBuckets(
  accountId: string,
  providerKey: string,
): Promise<IntegrationBudgetBucket[]> {
  const rows = await prisma.integrationBudgetBucket.findMany({
    where: {
      accountId: { in: [accountId, 'GLOBAL'] },
      enabled: true,
      OR: [
        { scope: 'global', scopeRef: 'ALL' },
        { scope: 'provider', scopeRef: providerKey },
      ],
    },
  });

  return refreshExpiredBuckets(rows);
}

async function refreshExpiredBuckets(
  rows: IntegrationBudgetBucket[],
): Promise<IntegrationBudgetBucket[]> {
  const now = new Date();

  return Promise.all(
    rows.map(async (row) => {
      const resetData = getExpiredBudgetBucketReset(row, now);
      if (!resetData) {
        return row;
      }

      // Match the api's rollover semantics without overwriting spend that a
      // concurrent request has already moved into the new period.
      const refresh = await prisma.integrationBudgetBucket.updateMany({
        where: {
          id: row.id,
          periodResetsAt: row.periodResetsAt,
        },
        data: resetData,
      });

      if (refresh.count === 0) {
        return prisma.integrationBudgetBucket.findUniqueOrThrow({
          where: { id: row.id },
        });
      }

      return { ...row, ...resetData };
    }),
  );
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
    const buckets = await loadApplicableBuckets(entry.accountId, entry.providerKey);

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
 * Returns true if the next worker-paid call would push the current-period
 * global or provider bucket over its hard cap. Worker callers can
 * short-circuit before making a paid call; matches the cost-control
 * service's BLOCK_OVER_BUDGET decision in spirit (without rate limits /
 * fallbacks).
 */
export async function isOverHardCap(
  accountId: string,
  providerKey: string,
  estimatedCostUsd: number = 0,
): Promise<boolean> {
  const buckets = await loadApplicableBuckets(accountId, providerKey);
  return buckets.some((b) =>
    wouldExceedHardCap(b.currentSpendUsd, b.hardCapUsd, estimatedCostUsd),
  );
}
