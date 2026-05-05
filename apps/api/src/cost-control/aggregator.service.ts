import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Increments daily aggregate rows on every recordActual. Keeps
// dashboards O(1) in row count rather than scanning the full event log
// for every render.
//
// Monthly aggregates are derived on demand by SUMming up to 31 day
// rows per (account, provider, action) — much cheaper than the prior
// design which double-wrote a `period='month'` row on every event.
// The table still supports `period='month'` rows; if a future report
// needs them pre-aggregated, schedule a daily cron that folds the
// previous day's `period='day'` rows into the matching month row.

@Injectable()
export class AggregatorService {
  private readonly logger = new Logger(AggregatorService.name);

  constructor(private prisma: PrismaService) {}

  async bump(params: {
    accountId: string;
    providerKey: string;
    action: string;
    when: Date;
    actualCostUsd: number;
    status: 'completed' | 'errored' | 'cache_hit' | 'rate_limited';
    costSavedUsd?: number;
  }): Promise<void> {
    try {
      await this.upsertSql({
        ...params,
        period: 'day',
        periodKey: ymd(params.when),
      });
    } catch (err) {
      this.logger.warn(`aggregate bump failed: ${err}`);
    }
  }

  private upsertSql(params: {
    accountId: string;
    providerKey: string;
    action: string;
    period: 'day' | 'month';
    periodKey: string;
    actualCostUsd: number;
    status: 'completed' | 'errored' | 'cache_hit' | 'rate_limited';
    costSavedUsd?: number;
  }) {
    const isError = params.status === 'errored' ? 1 : 0;
    const isCache = params.status === 'cache_hit' ? 1 : 0;
    const isRateLimited = params.status === 'rate_limited' ? 1 : 0;
    return this.prisma.integrationUsageAggregate.upsert({
      where: {
        accountId_providerKey_action_period_periodKey: {
          accountId: params.accountId,
          providerKey: params.providerKey,
          action: params.action,
          period: params.period,
          periodKey: params.periodKey,
        },
      },
      create: {
        accountId: params.accountId,
        providerKey: params.providerKey,
        action: params.action,
        period: params.period,
        periodKey: params.periodKey,
        callCount: 1,
        totalCostUsd: params.actualCostUsd,
        cacheHits: isCache,
        errors: isError,
        rateLimited: isRateLimited,
        costSavedUsd: params.costSavedUsd ?? 0,
      },
      update: {
        callCount: { increment: 1 },
        totalCostUsd: { increment: params.actualCostUsd },
        cacheHits: { increment: isCache },
        errors: { increment: isError },
        rateLimited: { increment: isRateLimited },
        costSavedUsd: { increment: params.costSavedUsd ?? 0 },
      },
    });
  }
}

function ymd(d: Date): string {
  const yr = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  return `${yr}-${mo}-${dy}`;
}
