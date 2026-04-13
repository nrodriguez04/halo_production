import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

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
        accountId: accountId || undefined,
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
          accountId: accountId || undefined,
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
}
