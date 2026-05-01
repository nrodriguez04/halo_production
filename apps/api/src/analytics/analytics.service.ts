import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AutomationRunStatus } from '@prisma/client';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  async getKPIs(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const end = endDate || new Date();

    // Lead metrics
    const totalLeads = await this.prisma.lead.count({
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
    });

    const enrichedLeads = await this.prisma.lead.count({
      where: {
        accountId,
        status: 'enriched',
        createdAt: { gte: start, lte: end },
      },
    });

    // Deal metrics
    const totalDeals = await this.prisma.deal.count({
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
    });

    const closedDeals = await this.prisma.deal.count({
      where: {
        accountId,
        stage: 'closed',
        createdAt: { gte: start, lte: end },
      },
    });

    const totalDealValue = await this.prisma.deal.aggregate({
      where: {
        accountId,
        stage: 'closed',
        createdAt: { gte: start, lte: end },
        offerAmount: { not: null },
      },
      _sum: {
        offerAmount: true,
      },
    });

    // Communication metrics
    const totalMessages = await this.prisma.message.count({
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
    });

    const sentMessages = await this.prisma.message.count({
      where: {
        accountId,
        status: 'sent',
        createdAt: { gte: start, lte: end },
      },
    });

    const approvedMessages = await this.prisma.message.count({
      where: {
        accountId,
        status: 'approved',
        createdAt: { gte: start, lte: end },
      },
    });

    // AI cost metrics
    const aiCosts = await this.prisma.aICostLog.findMany({
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
    });

    const totalAICost = aiCosts.reduce((sum, log) => sum + log.cost, 0);
    const aiRequests = aiCosts.length;

    // Conversion rates
    const leadToDealRate =
      totalLeads > 0 ? (totalDeals / totalLeads) * 100 : 0;
    const dealCloseRate =
      totalDeals > 0 ? (closedDeals / totalDeals) * 100 : 0;
    const messageApprovalRate =
      totalMessages > 0 ? (approvedMessages / totalMessages) * 100 : 0;

    // Stage distribution
    const stageDistribution = await this.prisma.deal.groupBy({
      by: ['stage'],
      where: {
        accountId,
        createdAt: { gte: start, lte: end },
      },
      _count: {
        stage: true,
      },
    });

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
    const data = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const leads = await this.prisma.lead.count({
        where: {
          accountId,
          createdAt: { gte: date, lt: nextDate },
        },
      });

      const deals = await this.prisma.deal.count({
        where: {
          accountId,
          createdAt: { gte: date, lt: nextDate },
        },
      });

      const aiCost = await this.prisma.aICostLog.aggregate({
        where: {
          accountId,
          createdAt: { gte: date, lt: nextDate },
        },
        _sum: {
          cost: true,
        },
      });

      data.push({
        date: date.toISOString().split('T')[0],
        leads,
        deals,
        aiCost: aiCost._sum.cost || 0,
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

    const runs = await this.prisma.automationRun.findMany({
      where: { tenantId: accountId, createdAt: { gte: start, lte: end } },
      select: {
        aiCostUsd: true,
        messageCostUsd: true,
        toolCostUsd: true,
        otherCostUsd: true,
      },
    });

    const aiSpend = runs.reduce((s, r) => s + (r.aiCostUsd || 0), 0);
    const messagingSpend = runs.reduce((s, r) => s + (r.messageCostUsd || 0), 0);
    const toolSpend = runs.reduce((s, r) => s + (r.toolCostUsd || 0), 0);
    const otherSpend = runs.reduce((s, r) => s + (r.otherCostUsd || 0), 0);
    const totalSpend = aiSpend + messagingSpend + toolSpend + otherSpend;

    return {
      aiSpend,
      messagingSpend,
      toolSpend,
      otherSpend,
      totalSpend,
      runCount: runs.length,
      avgCostPerRun: runs.length > 0 ? totalSpend / runs.length : 0,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getAutomationOutcomes(accountId: string, startDate?: Date, endDate?: Date) {
    const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = endDate || new Date();

    const runs = await this.prisma.automationRun.findMany({
      where: { tenantId: accountId, createdAt: { gte: start, lte: end } },
      select: { estimatedValueUsd: true, realizedValueUsd: true },
    });

    const estimatedValue = runs.reduce(
      (s, r) => s + (r.estimatedValueUsd || 0),
      0,
    );
    const realizedValue = runs.reduce(
      (s, r) => s + (r.realizedValueUsd || 0),
      0,
    );

    const agentDraftsSent = await this.prisma.message.count({
      where: {
        accountId,
        source: 'openclaw',
        status: { in: ['sent', 'delivered'] },
        createdAt: { gte: start, lte: end },
      },
    });

    const inboundReplies = await this.prisma.message.count({
      where: {
        accountId,
        direction: 'inbound',
        createdAt: { gte: start, lte: end },
      },
    });

    return {
      estimatedValue,
      realizedValue,
      agentDraftsSent,
      inboundReplies,
      period: { start: start.toISOString(), end: end.toISOString() },
    };
  }

  async getAutomationROI(accountId: string, startDate?: Date, endDate?: Date) {
    const costs = await this.getAutomationCosts(accountId, startDate, endDate);
    const outcomes = await this.getAutomationOutcomes(
      accountId,
      startDate,
      endDate,
    );

    const economics = await this.prisma.dealEconomics.findMany({
      where: { tenantId: accountId },
      select: { grossRevenue: true, netProfit: true, roiPercent: true },
    });

    const totalGrossRevenue = economics.reduce(
      (s, e) => s + (e.grossRevenue || 0),
      0,
    );
    const totalNetProfit = economics.reduce(
      (s, e) => s + (e.netProfit || 0),
      0,
    );

    const costPerReply =
      outcomes.inboundReplies > 0
        ? costs.totalSpend / outcomes.inboundReplies
        : null;

    return {
      costs,
      outcomes,
      dealEconomics: {
        totalGrossRevenue,
        totalNetProfit,
        avgRoi:
          economics.length > 0
            ? economics.reduce((s, e) => s + (e.roiPercent || 0), 0) /
              economics.length
            : null,
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
