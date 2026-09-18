import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

// Spend dashboards over integration_cost_events, the single cost ledger.
// Only rows the provider actually executed count as spend: blocked,
// cancelled, reserved and cache-hit rows carry no actual cost.
const SPENT = { status: 'completed' } as const;

@Injectable()
export class ApiCostService {
  constructor(private prisma: PrismaService) {}

  async getTodaySpend(accountId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = { ...SPENT, createdAt: { gte: today } };
    if (accountId) where.accountId = accountId;

    const result = await this.prisma.integrationCostEvent.groupBy({
      by: ['providerKey'],
      where,
      _sum: { actualCostUsd: true },
      _count: { id: true },
    });

    const total = result.reduce((s, r) => s + (r._sum.actualCostUsd || 0), 0);

    return {
      total,
      byProvider: result.map((r) => ({
        provider: r.providerKey,
        cost: r._sum.actualCostUsd || 0,
        calls: r._count.id,
      })),
    };
  }

  async getSpendByProvider(
    accountId: string,
    startDate?: Date,
    endDate?: Date,
  ) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const result = await this.prisma.integrationCostEvent.groupBy({
      by: ['providerKey'],
      where: {
        ...SPENT,
        accountId,
        createdAt: { gte: start, lte: end },
      },
      _sum: { actualCostUsd: true },
      _count: { id: true },
      _avg: { actualCostUsd: true, durationMs: true },
    });

    return result.map((r) => ({
      provider: r.providerKey,
      totalCost: r._sum.actualCostUsd || 0,
      callCount: r._count.id,
      avgCostPerCall: r._avg.actualCostUsd || 0,
      avgDurationMs: r._avg.durationMs || 0,
    }));
  }

  async getSpendSummary(accountId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const since = (from: Date) =>
      this.prisma.integrationCostEvent.aggregate({
        where: { ...SPENT, accountId, createdAt: { gte: from } },
        _sum: { actualCostUsd: true },
        _count: { id: true },
      });
    const [todayResult, weekResult, monthResult] = await Promise.all([
      since(todayStart),
      since(sevenDaysAgo),
      since(thirtyDaysAgo),
    ]);

    const dailyAvg30 = (monthResult._sum.actualCostUsd || 0) / 30;

    return {
      today: {
        cost: todayResult._sum.actualCostUsd || 0,
        calls: todayResult._count.id,
      },
      week: {
        cost: weekResult._sum.actualCostUsd || 0,
        calls: weekResult._count.id,
      },
      month: {
        cost: monthResult._sum.actualCostUsd || 0,
        calls: monthResult._count.id,
      },
      projectedMonthly: dailyAvg30 * 30,
    };
  }

  async getDailyTrend(accountId: string, days: number = 30) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.prisma.$queryRaw<
      { day: Date; provider: string; cost: number; calls: bigint }[]
    >`
      SELECT
        DATE_TRUNC('day', "createdAt") as day,
        "providerKey" as provider,
        SUM(COALESCE("actualCostUsd", 0))::float as cost,
        COUNT(*)::bigint as calls
      FROM integration_cost_events
      WHERE "accountId" = ${accountId}
        AND "status" = 'completed'
        AND "createdAt" >= ${since}
      GROUP BY day, provider
      ORDER BY day ASC
    `;

    return rows.map((r) => ({
      day: r.day.toISOString().split('T')[0],
      provider: r.provider,
      cost: r.cost,
      calls: Number(r.calls),
    }));
  }

  async getEndpointBreakdown(accountId: string, provider: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.integrationCostEvent.groupBy({
      by: ['action'],
      where: {
        ...SPENT,
        accountId,
        providerKey: provider,
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { actualCostUsd: true },
      _count: { id: true },
      _avg: { actualCostUsd: true, durationMs: true },
    });

    return result.map((r) => ({
      endpoint: r.action,
      totalCost: r._sum.actualCostUsd || 0,
      callCount: r._count.id,
      avgCostPerCall: r._avg.actualCostUsd || 0,
      avgDurationMs: r._avg.durationMs || 0,
    }));
  }

  async getTodayTotal(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await this.prisma.integrationCostEvent.aggregate({
      where: { ...SPENT, createdAt: { gte: today } },
      _sum: { actualCostUsd: true },
    });
    return result._sum.actualCostUsd || 0;
  }
}
