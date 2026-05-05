import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import type { CostIntent } from './dto/cost-intent.dto';

// Budget bucket lookup + atomic debit/credit.
//
// A single intent can debit multiple buckets simultaneously (e.g. a
// Twilio SMS counts against the global daily cap, the twilio provider
// monthly cap, and the campaign cap). We fetch all applicable buckets
// in one query, decide ALLOW/BLOCK against the most-restrictive one,
// then debit the entire set in `recordActual`.
//
// Buckets auto-roll forward: if `periodResetsAt` is in the past we
// rebuild the row in place with fresh start/end timestamps.

export interface ApplicableBucket {
  id: string;
  scope: string;
  scopeRef: string;
  period: string;
  hardCapUsd: number;
  softCapUsd: number | null;
  currentSpendUsd: number;
  enabled: boolean;
}

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(private prisma: PrismaService) {}

  async findApplicable(intent: CostIntent): Promise<ApplicableBucket[]> {
    const ctx = intent.context;
    const orFilters: Prisma.IntegrationBudgetBucketWhereInput[] = [
      { scope: 'global', scopeRef: 'ALL' },
      { scope: 'provider', scopeRef: intent.provider },
    ];
    if (intent.hints?.workflow) {
      orFilters.push({ scope: 'workflow', scopeRef: intent.hints.workflow });
    }
    if (ctx.campaignId) {
      orFilters.push({ scope: 'campaign', scopeRef: ctx.campaignId });
    }
    if (ctx.leadId) {
      orFilters.push({ scope: 'lead', scopeRef: ctx.leadId });
    }

    const rows = await this.prisma.integrationBudgetBucket.findMany({
      where: {
        accountId: { in: [ctx.accountId, 'GLOBAL'] },
        enabled: true,
        OR: orFilters,
      },
    });

    const now = new Date();
    const refreshed = await Promise.all(
      rows.map(async (row) => {
        if (row.periodResetsAt.getTime() <= now.getTime()) {
          // Roll the bucket forward into the new period and zero the spend.
          const { startedAt, resetsAt } = nextPeriod(row.period, now);
          const updated = await this.prisma.integrationBudgetBucket.update({
            where: { id: row.id },
            data: {
              periodStartedAt: startedAt,
              periodResetsAt: resetsAt,
              currentSpendUsd: 0,
            },
          });
          return updated;
        }
        return row;
      }),
    );

    return refreshed.map((r) => ({
      id: r.id,
      scope: r.scope,
      scopeRef: r.scopeRef,
      period: r.period,
      hardCapUsd: r.hardCapUsd,
      softCapUsd: r.softCapUsd,
      currentSpendUsd: r.currentSpendUsd,
      enabled: r.enabled,
    }));
  }

  /**
   * Returns the bucket that would tip over its hard cap if `estimatedCostUsd`
   * were debited. Returns null if all buckets have headroom.
   */
  findOverHardCap(buckets: ApplicableBucket[], estimatedCostUsd: number): ApplicableBucket | null {
    return (
      buckets.find((b) => b.currentSpendUsd + estimatedCostUsd > b.hardCapUsd) ?? null
    );
  }

  /**
   * Returns the most-loaded bucket that has crossed its soft cap. Used to
   * surface ALLOW_WITH_WARNING.
   */
  findOverSoftCap(buckets: ApplicableBucket[], estimatedCostUsd: number): ApplicableBucket | null {
    let worst: { bucket: ApplicableBucket; ratio: number } | null = null;
    for (const b of buckets) {
      const cap = b.softCapUsd ?? b.hardCapUsd * 0.8;
      const projected = b.currentSpendUsd + estimatedCostUsd;
      if (projected >= cap) {
        const ratio = projected / b.hardCapUsd;
        if (!worst || ratio > worst.ratio) worst = { bucket: b, ratio };
      }
    }
    return worst?.bucket ?? null;
  }

  async debit(bucketIds: string[], amountUsd: number): Promise<void> {
    if (bucketIds.length === 0 || amountUsd === 0) return;
    await this.prisma.integrationBudgetBucket.updateMany({
      where: { id: { in: bucketIds } },
      data: { currentSpendUsd: { increment: amountUsd } },
    });
  }
}

export function nextPeriod(period: string, anchor: Date): { startedAt: Date; resetsAt: Date } {
  const startedAt = startOfPeriod(period, anchor);
  const resetsAt = endOfPeriod(period, startedAt);
  return { startedAt, resetsAt };
}

export function startOfPeriod(period: string, d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  if (period === 'week') {
    const day = out.getDay();
    out.setDate(out.getDate() - day);
  } else if (period === 'month') {
    out.setDate(1);
  }
  return out;
}

export function endOfPeriod(period: string, start: Date): Date {
  const out = new Date(start);
  if (period === 'day') out.setDate(out.getDate() + 1);
  else if (period === 'week') out.setDate(out.getDate() + 7);
  else if (period === 'month') out.setMonth(out.getMonth() + 1);
  else out.setDate(out.getDate() + 1);
  return out;
}
