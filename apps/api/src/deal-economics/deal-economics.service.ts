import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DealEconomicsService {
  constructor(private prisma: PrismaService) {}

  async upsert(
    dealId: string,
    tenantId: string,
    data: {
      contractPrice?: number | null;
      assignmentPrice?: number | null;
      assignmentFee?: number | null;
      purchasePrice?: number | null;
      salePrice?: number | null;
      closingCosts?: number | null;
      marketingCost?: number | null;
      skipTraceCost?: number | null;
      smsCost?: number | null;
      emailCost?: number | null;
      aiCostAllocated?: number | null;
      toolingCost?: number | null;
      laborCost?: number | null;
      otherCost?: number | null;
      notes?: string | null;
    },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId: tenantId },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const computed = this.computeMetrics(data);

    const economics = await this.prisma.dealEconomics.upsert({
      where: { dealId },
      create: {
        dealId,
        tenantId,
        ...data,
        ...computed,
      },
      update: {
        ...data,
        ...computed,
      },
    });

    return economics;
  }

  async getByDeal(dealId: string, tenantId: string) {
    const economics = await this.prisma.dealEconomics.findFirst({
      where: { dealId, tenantId },
    });

    if (!economics) {
      throw new NotFoundException(
        `Economics for deal ${dealId} not found`,
      );
    }

    return economics;
  }

  async getByTenant(
    tenantId: string,
    opts?: { skip?: number; take?: number },
  ) {
    return this.prisma.dealEconomics.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
      skip: opts?.skip,
      take: opts?.take || 50,
      include: {
        deal: {
          select: {
            id: true,
            stage: true,
            property: { select: { address: true, city: true, state: true } },
          },
        },
      },
    });
  }

  /**
   * Recompute derived fields when costs/revenue inputs change.
   * Supports both wholesale assignment and buy-sell models.
   */
  computeMetrics(data: Record<string, any>) {
    const totalCosts =
      (data.closingCosts || 0) +
      (data.marketingCost || 0) +
      (data.skipTraceCost || 0) +
      (data.smsCost || 0) +
      (data.emailCost || 0) +
      (data.aiCostAllocated || 0) +
      (data.toolingCost || 0) +
      (data.laborCost || 0) +
      (data.otherCost || 0);

    let grossRevenue: number | null = null;

    if (data.assignmentFee != null) {
      grossRevenue = data.assignmentFee;
    } else if (data.salePrice != null && data.purchasePrice != null) {
      grossRevenue = data.salePrice - data.purchasePrice;
    } else if (
      data.assignmentPrice != null &&
      data.contractPrice != null
    ) {
      grossRevenue = data.assignmentPrice - data.contractPrice;
    }

    let netProfit: number | null = null;
    if (grossRevenue != null) {
      netProfit = grossRevenue - totalCosts;
    }

    let roiPercent: number | null = null;
    if (netProfit != null && totalCosts > 0) {
      roiPercent = (netProfit / totalCosts) * 100;
    }

    return { grossRevenue, netProfit, roiPercent };
  }

  async allocateAutomationCosts(dealId: string, tenantId: string) {
    const runs = await this.prisma.automationRun.findMany({
      where: { tenantId, entityType: 'deal', entityId: dealId },
    });

    const totalAiCost = runs.reduce(
      (sum, r) => sum + (r.aiCostUsd || 0),
      0,
    );
    const totalMsgCost = runs.reduce(
      (sum, r) => sum + (r.messageCostUsd || 0),
      0,
    );
    const totalToolCost = runs.reduce(
      (sum, r) => sum + (r.toolCostUsd || 0),
      0,
    );

    const existing = await this.prisma.dealEconomics.findUnique({
      where: { dealId },
    });

    if (existing) {
      return this.upsert(dealId, tenantId, {
        ...existing,
        aiCostAllocated: totalAiCost,
        toolingCost: totalToolCost,
        smsCost: (existing.smsCost || 0) + totalMsgCost,
      });
    }

    return this.upsert(dealId, tenantId, {
      aiCostAllocated: totalAiCost,
      toolingCost: totalToolCost,
      smsCost: totalMsgCost,
    });
  }
}
