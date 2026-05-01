import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface LogCostParams {
  accountId: string;
  provider: string;
  endpoint: string;
  costUsd: number;
  responseCode?: number;
  durationMs?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class ApiCostService {
  private readonly logger = new Logger(ApiCostService.name);

  constructor(private prisma: PrismaService) {}

  async log(params: LogCostParams) {
    try {
      await this.prisma.apiCostLog.create({
        data: {
          accountId: params.accountId,
          provider: params.provider,
          endpoint: params.endpoint,
          costUsd: params.costUsd,
          responseCode: params.responseCode,
          durationMs: params.durationMs,
          metadata: params.metadata ?? undefined,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to log API cost: ${err}`);
    }
  }

  async getTodaySpend(accountId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = { createdAt: { gte: today } };
    if (accountId) where.accountId = accountId;

    const result = await this.prisma.apiCostLog.groupBy({
      by: ['provider'],
      where,
      _sum: { costUsd: true },
      _count: { id: true },
    });

    const total = result.reduce((s, r) => s + (r._sum.costUsd || 0), 0);

    return {
      total,
      byProvider: result.map((r) => ({
        provider: r.provider,
        cost: r._sum.costUsd || 0,
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

    const result = await this.prisma.apiCostLog.groupBy({
      by: ['provider'],
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
      _sum: { costUsd: true },
      _count: { id: true },
      _avg: { costUsd: true, durationMs: true },
    });

    return result.map((r) => ({
      provider: r.provider,
      totalCost: r._sum.costUsd || 0,
      callCount: r._count.id,
      avgCostPerCall: r._avg.costUsd || 0,
      avgDurationMs: r._avg.durationMs || 0,
    }));
  }

  async getSpendSummary(accountId: string) {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [todayResult, weekResult, monthResult] = await Promise.all([
      this.prisma.apiCostLog.aggregate({
        where: { accountId, createdAt: { gte: todayStart } },
        _sum: { costUsd: true },
        _count: { id: true },
      }),
      this.prisma.apiCostLog.aggregate({
        where: { accountId, createdAt: { gte: sevenDaysAgo } },
        _sum: { costUsd: true },
        _count: { id: true },
      }),
      this.prisma.apiCostLog.aggregate({
        where: { accountId, createdAt: { gte: thirtyDaysAgo } },
        _sum: { costUsd: true },
        _count: { id: true },
      }),
    ]);

    const dailyAvg30 = (monthResult._sum.costUsd || 0) / 30;

    return {
      today: { cost: todayResult._sum.costUsd || 0, calls: todayResult._count.id },
      week: { cost: weekResult._sum.costUsd || 0, calls: weekResult._count.id },
      month: { cost: monthResult._sum.costUsd || 0, calls: monthResult._count.id },
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
        provider,
        SUM("costUsd")::float as cost,
        COUNT(*)::bigint as calls
      FROM api_cost_logs
      WHERE "accountId" = ${accountId} AND "createdAt" >= ${since}
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

    const result = await this.prisma.apiCostLog.groupBy({
      by: ['endpoint'],
      where: {
        accountId,
        provider,
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { costUsd: true },
      _count: { id: true },
      _avg: { costUsd: true, durationMs: true },
    });

    return result.map((r) => ({
      endpoint: r.endpoint,
      totalCost: r._sum.costUsd || 0,
      callCount: r._count.id,
      avgCostPerCall: r._avg.costUsd || 0,
      avgDurationMs: r._avg.durationMs || 0,
    }));
  }

  async getTodayTotal(): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result = await this.prisma.apiCostLog.aggregate({
      where: { createdAt: { gte: today } },
      _sum: { costUsd: true },
    });
    return result._sum.costUsd || 0;
  }
}
