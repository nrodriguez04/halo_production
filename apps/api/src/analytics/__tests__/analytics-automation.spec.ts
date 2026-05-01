import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../prisma.service';

describe('AnalyticsService — Automation', () => {
  let service: AnalyticsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      automationRun: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      message: {
        count: jest.fn().mockResolvedValue(0),
      },
      dealEconomics: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      lead: { count: jest.fn().mockResolvedValue(0) },
      deal: {
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _sum: { offerAmount: 0 } }),
        groupBy: jest.fn().mockResolvedValue([]),
      },
      aICostLog: {
        findMany: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn().mockResolvedValue({ _sum: { cost: 0 } }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
  });

  describe('getAutomationOverview', () => {
    it('should return aggregated run counts', async () => {
      prisma.automationRun.count
        .mockResolvedValueOnce(10)  // total
        .mockResolvedValueOnce(6)   // completed
        .mockResolvedValueOnce(2)   // failed
        .mockResolvedValueOnce(1)   // cancelled
        .mockResolvedValueOnce(1)   // awaiting approval
        .mockResolvedValueOnce(0);  // running

      prisma.message.count
        .mockResolvedValueOnce(8)   // drafts
        .mockResolvedValueOnce(5);  // approved

      const result = await service.getAutomationOverview('tenant-1');

      expect(result.runs.total).toBe(10);
      expect(result.runs.completed).toBe(6);
      expect(result.runs.failed).toBe(2);
      expect(result.approvalRate).toBeCloseTo(62.5, 1);
    });
  });

  describe('getAutomationCosts', () => {
    it('should aggregate costs across runs', async () => {
      prisma.automationRun.findMany.mockResolvedValue([
        { aiCostUsd: 0.10, messageCostUsd: 0.05, toolCostUsd: 0.02, otherCostUsd: 0 },
        { aiCostUsd: 0.05, messageCostUsd: 0.03, toolCostUsd: 0.01, otherCostUsd: 0.01 },
      ]);

      const result = await service.getAutomationCosts('tenant-1');

      expect(result.aiSpend).toBeCloseTo(0.15, 2);
      expect(result.messagingSpend).toBeCloseTo(0.08, 2);
      expect(result.totalSpend).toBeCloseTo(0.27, 2);
      expect(result.runCount).toBe(2);
    });
  });

  describe('getAutomationROI', () => {
    it('should combine costs, outcomes, and economics', async () => {
      prisma.automationRun.findMany.mockResolvedValue([
        {
          aiCostUsd: 0.50,
          messageCostUsd: 1.00,
          toolCostUsd: 0,
          otherCostUsd: 0,
          estimatedValueUsd: 500,
          realizedValueUsd: 200,
        },
      ]);

      prisma.message.count
        .mockResolvedValueOnce(5)   // drafts sent
        .mockResolvedValueOnce(3);  // inbound replies

      prisma.dealEconomics.findMany.mockResolvedValue([
        { grossRevenue: 25000, netProfit: 22000, roiPercent: 600 },
      ]);

      const result = await service.getAutomationROI('tenant-1');

      expect(result.costs.totalSpend).toBeCloseTo(1.5, 2);
      expect(result.dealEconomics.totalGrossRevenue).toBe(25000);
      expect(result.dealEconomics.totalNetProfit).toBe(22000);
    });
  });

  describe('getAutomationByWorkflow', () => {
    it('should group runs by workflow name', async () => {
      prisma.automationRun.groupBy.mockResolvedValue([
        {
          workflowName: 'draft-seller-sms',
          _count: { id: 5 },
          _sum: { aiCostUsd: 0.10, messageCostUsd: 0.20, toolCostUsd: 0, estimatedValueUsd: 1000, realizedValueUsd: 500 },
        },
      ]);

      const result = await service.getAutomationByWorkflow('tenant-1');

      expect(result[0].workflowName).toBe('draft-seller-sms');
      expect(result[0].runCount).toBe(5);
    });
  });
});
