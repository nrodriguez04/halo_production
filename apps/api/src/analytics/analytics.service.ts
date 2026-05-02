import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AutomationRunStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getKPIs(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();
    const inRange = { gte: start, lte: end };

    const [
      totalLeads,
      enrichedLeads,
      totalDeals,
      closedDeals,
      totalDealValue,
      totalMessages,
      sentMessages,
      approvedMessages,
      aiCostAgg,
      stageDistribution,
    ] = await Promise.all([
      this.prisma.lead.count({ where: { accountId, createdAt: inRange } }),
      this.prisma.lead.count({
        where: { accountId, status: 'enriched', createdAt: inRange },
      }),
      this.prisma.deal.count({ where: { accountId, createdAt: inRange } }),
      this.prisma.deal.count({
        where: { accountId, stage: 'closed', createdAt: inRange },
      }),
      this.prisma.deal.aggregate({
        where: {
          accountId,
          stage: 'closed',
          createdAt: inRange,
          offerAmount: { not: null },
        },
        _sum: { offerAmount: true },
      }),
      this.prisma.message.count({ where: { accountId, createdAt: inRange } }),
      this.prisma.message.count({
        where: { accountId, status: 'sent', createdAt: inRange },
      }),
      this.prisma.message.count({
        where: { accountId, status: 'approved', createdAt: inRange },
      }),
      this.prisma.aICostLog.aggregate({
        where: { accountId, createdAt: inRange },
        _sum: { cost: true },
        _count: { id: true },
      }),
      this.prisma.deal.groupBy({
        by: ['stage'],
        where: { accountId, createdAt: inRange },
        _count: { stage: true },
      }),
    ]);

    const totalAICost = aiCostAgg._sum.cost || 0;
    const aiRequests = aiCostAgg._count.id;

    const leadToDealRate =
      totalLeads > 0 ? (totalDeals / totalLeads) * 100 : 0;
    const dealCloseRate =
      totalDeals > 0 ? (closedDeals / totalDeals) * 100 : 0;
    const messageApprovalRate =
      totalMessages > 0 ? (approvedMessages / totalMessages) * 100 : 0;

    return {
      leads: {
        total: totalLeads,
        enriched: enrichedLeads,
        enrichmentRate: totalLeads > 0 ? (enrichedLeads / totalLeads) * 100 : 0,
      },
      deals: {
        total: totalDeals,
        closed: closedDeals,
        totalValue: totalDealValue._sum.offerAmount || 0,
        closeRate: dealCloseRate,
        leadToDealRate,
        stageDistribution: stageDistribution.map((s) => ({
          stage: s.stage,
          count: s._count.stage,
        })),
      },
      communications: {
        total: totalMessages,
        sent: sentMessages,
        approved: approvedMessages,
        approvalRate: messageApprovalRate,
      },
      ai: {
        totalCost: totalAICost,
        requests: aiRequests,
        avgCostPerRequest: aiRequests > 0 ? totalAICost / aiRequests : 0,
      },
      period: {
        start: start.toISOString(),
        end: end.toISOString(),
      },
    };
  }

  async getTrends(accountId: string, days = 30) {
    // Replaces a per-day loop (3 queries × N days = 90 queries for 30d) with 3 grouped
    // queries that bucket rows by day in a single round trip per table.
    const now = new Date();
    const start = new Date(now);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - (days - 1));

    type DailyAgg = { day: Date; n: bigint; cost?: number };

    const [leadDaily, dealDaily, aiCostDaily] = await Promise.all([
      this.prisma.$queryRaw<DailyAgg[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS n
        FROM leads
        WHERE "accountId" = ${accountId} AND "createdAt" >= ${start}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<DailyAgg[]>`
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*)::bigint AS n
        FROM deals
        WHERE "accountId" = ${accountId} AND "createdAt" >= ${start}
        GROUP BY 1
      `,
      this.prisma.$queryRaw<{ day: Date; cost: number }[]>`
        SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("cost"), 0)::float AS cost
        FROM ai_cost_logs
        WHERE "accountId" = ${accountId} AND "createdAt" >= ${start}
        GROUP BY 1
      `,
    ]);

    const leadsByDay = new Map<string, number>();
    const dealsByDay = new Map<string, number>();
    const costByDay = new Map<string, number>();

    for (const r of leadDaily) {
      leadsByDay.set(r.day.toISOString().split('T')[0], Number(r.n));
    }
    for (const r of dealDaily) {
      dealsByDay.set(r.day.toISOString().split('T')[0], Number(r.n));
    }
    for (const r of aiCostDaily) {
      costByDay.set(r.day.toISOString().split('T')[0], Number(r.cost));
    }

    const data: Array<{ date: string; leads: number; deals: number; aiCost: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      const key = d.toISOString().split('T')[0];
      data.push({
        date: key,
        leads: leadsByDay.get(key) || 0,
        deals: dealsByDay.get(key) || 0,
        aiCost: costByDay.get(key) || 0,
      });
    }

    return data;
  }

  // --- Automation & ROI Analytics ---

  async getAutomationOverview(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();
    const where = { tenantId: accountId, createdAt: { gte: start, lte: end } };

    const [total, completed, failed, cancelled, awaitingApproval] =
      await Promise.all([
        this.prisma.automationRun.count({ where }),
        this.prisma.automationRun.count({
          where: { ...where, status: AutomationRunStatus.COMPLETED },
        }),
        this.prisma.automationRun.count({
          where: { ...where, status: AutomationRunStatus.FAILED },
        }),
        this.prisma.automationRun.count({
          where: { ...where, status: AutomationRunStatus.CANCELLED },
        }),
        this.prisma.automationRun.count({
          where: { ...where, status: AutomationRunStatus.AWAITING_APPROVAL },
        }),
      ]);

    const running = await this.prisma.automationRun.count({
      where: { ...where, status: AutomationRunStatus.RUNNING },
    });

    const draftMessages = await this.prisma.message.count({
      where: {
        accountId,
        source: 'openclaw',
        createdAt: { gte: start, lte: end },
      },
    });

    const approvedMessages = await this.prisma.message.count({
      where: {
        accountId,
        source: 'openclaw',
        status: { in: ['approved', 'sent', 'delivered'] },
        createdAt: { gte: start, lte: end },
      },
    });

    return {
      runs: { total, completed, failed, cancelled, awaitingApproval, running },
      drafts: draftMessages,
      approvedMessages,
      approvalRate: draftMessages > 0 ? (approvedMessages / draftMessages) * 100 : 0,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getAutomationRuns(
    accountId: string,
    opts?: { skip?: number; take?: number; status?: string },
  ) {
    const where: any = { tenantId: accountId };
    if (opts?.status) where.status = opts.status;

    return this.prisma.automationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: opts?.skip,
      take: opts?.take || 50,
    });
  }

  async getAutomationCosts(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const agg = await this.prisma.automationRun.aggregate({
      where: { tenantId: accountId, createdAt: { gte: start, lte: end } },
      _sum: {
        aiCostUsd: true,
        messageCostUsd: true,
        toolCostUsd: true,
        otherCostUsd: true,
      },
      _count: { id: true },
    });

    const aiSpend = agg._sum.aiCostUsd || 0;
    const messagingSpend = agg._sum.messageCostUsd || 0;
    const toolSpend = agg._sum.toolCostUsd || 0;
    const otherSpend = agg._sum.otherCostUsd || 0;
    const totalSpend = aiSpend + messagingSpend + toolSpend + otherSpend;
    const runCount = agg._count.id;

    return {
      aiSpend,
      messagingSpend,
      toolSpend,
      otherSpend,
      totalSpend,
      runCount,
      avgCostPerRun: runCount > 0 ? totalSpend / runCount : 0,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getAutomationOutcomes(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();
    const inRange = { gte: start, lte: end };

    const [valueAgg, agentDraftsSent, inboundReplies] = await Promise.all([
      this.prisma.automationRun.aggregate({
        where: { tenantId: accountId, createdAt: inRange },
        _sum: { estimatedValueUsd: true, realizedValueUsd: true },
      }),
      this.prisma.message.count({
        where: {
          accountId,
          source: 'openclaw',
          status: { in: ['sent', 'delivered'] },
          createdAt: inRange,
        },
      }),
      this.prisma.message.count({
        where: {
          accountId,
          direction: 'inbound',
          createdAt: inRange,
        },
      }),
    ]);

    return {
      estimatedValue: valueAgg._sum.estimatedValueUsd || 0,
      realizedValue: valueAgg._sum.realizedValueUsd || 0,
      agentDraftsSent,
      inboundReplies,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getAutomationROI(accountId: string, startDate?: Date, endDate?: Date) {
    const [costs, outcomes, economicsAgg] = await Promise.all([
      this.getAutomationCosts(accountId, startDate, endDate),
      this.getAutomationOutcomes(accountId, startDate, endDate),
      this.prisma.dealEconomics.aggregate({
        where: { tenantId: accountId },
        _sum: { grossRevenue: true, netProfit: true },
        _avg: { roiPercent: true },
        _count: { id: true },
      }),
    ]);

    const costPerReply =
      outcomes.inboundReplies > 0
        ? costs.totalSpend / outcomes.inboundReplies
        : null;

    return {
      costs,
      outcomes,
      dealEconomics: {
        totalGrossRevenue: economicsAgg._sum.grossRevenue || 0,
        totalNetProfit: economicsAgg._sum.netProfit || 0,
        avgRoi: economicsAgg._count.id > 0 ? economicsAgg._avg.roiPercent : null,
      },
      derivedMetrics: {
        costPerReply,
        totalAutomationSpend: costs.totalSpend,
        estimatedValue: outcomes.estimatedValue,
        realizedValue: outcomes.realizedValue,
      },
    };
  }

  async getAutomationByWorkflow(accountId: string) {
    const workflows = await this.prisma.automationRun.groupBy({
      by: ['workflowName'],
      where: { tenantId: accountId },
      _count: { id: true },
      _sum: {
        aiCostUsd: true,
        messageCostUsd: true,
        toolCostUsd: true,
        estimatedValueUsd: true,
        realizedValueUsd: true,
      },
    });

    return workflows.map((w) => ({
      workflowName: w.workflowName || 'unknown',
      runCount: w._count.id,
      totalAiCost: w._sum.aiCostUsd || 0,
      totalMsgCost: w._sum.messageCostUsd || 0,
      totalToolCost: w._sum.toolCostUsd || 0,
      estimatedValue: w._sum.estimatedValueUsd || 0,
      realizedValue: w._sum.realizedValueUsd || 0,
    }));
  }

  async getAutomationByAgent(accountId: string) {
    const agents = await this.prisma.automationRun.groupBy({
      by: ['agentName'],
      where: { tenantId: accountId },
      _count: { id: true },
      _sum: {
        aiCostUsd: true,
        messageCostUsd: true,
        toolCostUsd: true,
        estimatedValueUsd: true,
        realizedValueUsd: true,
      },
    });

    return agents.map((a) => ({
      agentName: a.agentName || 'unknown',
      runCount: a._count.id,
      totalAiCost: a._sum.aiCostUsd || 0,
      totalMsgCost: a._sum.messageCostUsd || 0,
      totalToolCost: a._sum.toolCostUsd || 0,
      estimatedValue: a._sum.estimatedValueUsd || 0,
      realizedValue: a._sum.realizedValueUsd || 0,
    }));
  }

  async getAutomationAgentCards(accountId: string) {
    const agentNames = await this.prisma.automationRun.groupBy({
      by: ['agentName'],
      where: { tenantId: accountId },
    });

    const cards = await Promise.all(
      agentNames.map(async ({ agentName }) => {
        const name = agentName || 'unknown';

        const where = { tenantId: accountId, agentName };

        const [totals, statusCounts, lastRun] = await Promise.all([
          this.prisma.automationRun.aggregate({
            where,
            _count: { id: true },
            _sum: {
              aiCostUsd: true,
              messageCostUsd: true,
              toolCostUsd: true,
              estimatedValueUsd: true,
              realizedValueUsd: true,
            },
          }),
          this.prisma.automationRun.groupBy({
            by: ['status'],
            where,
            _count: { id: true },
          }),
          this.prisma.automationRun.findFirst({
            where,
            orderBy: { createdAt: 'desc' },
            select: { id: true, status: true, createdAt: true, completedAt: true },
          }),
        ]);

        const statusMap: Record<string, number> = {};
        for (const s of statusCounts) {
          statusMap[s.status] = s._count.id;
        }

        const completed = statusMap['COMPLETED'] || 0;
        const failed = statusMap['FAILED'] || 0;
        const running = statusMap['RUNNING'] || 0;
        const queued = statusMap['QUEUED'] || 0;
        const awaitingApproval = statusMap['AWAITING_APPROVAL'] || 0;
        const total = totals._count.id;
        const finishedRuns = completed + failed;

        return {
          agentName: name,
          totalRuns: total,
          completed,
          failed,
          running,
          queued,
          awaitingApproval,
          successRate: finishedRuns > 0 ? (completed / finishedRuns) * 100 : null,
          totalSpend:
            (totals._sum.aiCostUsd || 0) +
            (totals._sum.messageCostUsd || 0) +
            (totals._sum.toolCostUsd || 0),
          aiCost: totals._sum.aiCostUsd || 0,
          msgCost: totals._sum.messageCostUsd || 0,
          toolCost: totals._sum.toolCostUsd || 0,
          estimatedValue: totals._sum.estimatedValueUsd || 0,
          realizedValue: totals._sum.realizedValueUsd || 0,
          lastRun: lastRun
            ? {
                id: lastRun.id,
                status: lastRun.status,
                createdAt: lastRun.createdAt,
                completedAt: lastRun.completedAt,
              }
            : null,
        };
      }),
    );

    return cards.sort((a, b) => b.totalRuns - a.totalRuns);
  }
}
