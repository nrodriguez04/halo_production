import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsService } from '../analytics.service';
import { PrismaService } from '../../prisma.service';

describe('AnalyticsService — Automation', () => {
  let service: AnalyticsService;
  let prisma: any;

  // `automationRun.aggregate` is called with two different `_sum` shapes:
  // getAutomationCosts() asks for the cost columns, getAutomationOutcomes()
  // asks for the value columns. They run concurrently inside
  // getAutomationROI(), so the mock dispatches on the requested fields
  // rather than on call order. Tests override these fixtures.
  let costAggregate: any;
  let valueAggregate: any;

  beforeEach(async () => {
    costAggregate = {
      _sum: {
        aiCostUsd: 0,
        messageCostUsd: 0,
        toolCostUsd: 0,
        otherCostUsd: 0,
      },
      _count: { id: 0 },
    };
    valueAggregate = {
      _sum: { estimatedValueUsd: 0, realizedValueUsd: 0 },
    };

    prisma = {
      automationRun: {
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        groupBy: jest.fn().mockResolvedValue([]),
        aggregate: jest.fn(async (args: any) =>
          args?._sum?.estimatedValueUsd ? valueAggregate : costAggregate,
        ),
      },
      message: {
        count: jest.fn().mockResolvedValue(0),
      },
      dealEconomics: {
        aggregate: jest.fn().mockResolvedValue({
          _sum: { grossRevenue: 0, netProfit: 0 },
          _avg: { roiPercent: null },
          _count: { id: 0 },
        }),
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
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(6) // completed
        .mockResolvedValueOnce(2) // failed
        .mockResolvedValueOnce(1) // cancelled
        .mockResolvedValueOnce(1) // awaiting approval
        .mockResolvedValueOnce(0); // running

      prisma.message.count
        .mockResolvedValueOnce(8) // drafts
        .mockResolvedValueOnce(5); // approved

      const result = await service.getAutomationOverview('tenant-1');

      expect(result.runs.total).toBe(10);
      expect(result.runs.completed).toBe(6);
      expect(result.runs.failed).toBe(2);
      expect(result.approvalRate).toBeCloseTo(62.5, 1);
    });
  });

  describe('getAutomationCosts', () => {
    it('should aggregate costs across runs', async () => {
      // Sums of the two runs this test previously listed row-by-row.
      costAggregate = {
        _sum: {
          aiCostUsd: 0.15,
          messageCostUsd: 0.08,
          toolCostUsd: 0.03,
          otherCostUsd: 0.01,
        },
        _count: { id: 2 },
      };

      const result = await service.getAutomationCosts('tenant-1');

      expect(result.aiSpend).toBeCloseTo(0.15, 2);
      expect(result.messagingSpend).toBeCloseTo(0.08, 2);
      expect(result.totalSpend).toBeCloseTo(0.27, 2);
      expect(result.runCount).toBe(2);
    });
  });

  describe('getAutomationROI', () => {
    it('should combine costs, outcomes, and economics', async () => {
      costAggregate = {
        _sum: {
          aiCostUsd: 0.5,
          messageCostUsd: 1.0,
          toolCostUsd: 0,
          otherCostUsd: 0,
        },
        _count: { id: 1 },
      };
      valueAggregate = {
        _sum: { estimatedValueUsd: 500, realizedValueUsd: 200 },
      };

      prisma.message.count
        .mockResolvedValueOnce(5) // drafts sent
        .mockResolvedValueOnce(3); // inbound replies

      prisma.dealEconomics.aggregate.mockResolvedValue({
        _sum: { grossRevenue: 25000, netProfit: 22000 },
        _avg: { roiPercent: 600 },
        _count: { id: 1 },
      });

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
          _sum: {
            aiCostUsd: 0.1,
            messageCostUsd: 0.2,
            toolCostUsd: 0,
            estimatedValueUsd: 1000,
            realizedValueUsd: 500,
          },
        },
      ]);

      const result = await service.getAutomationByWorkflow('tenant-1');

      expect(result[0].workflowName).toBe('draft-seller-sms');
      expect(result[0].runCount).toBe(5);
    });
  });
});
