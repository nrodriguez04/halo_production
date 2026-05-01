import { Test, TestingModule } from '@nestjs/testing';
import { DealEconomicsService } from '../deal-economics.service';
import { PrismaService } from '../../prisma.service';
import { NotFoundException } from '@nestjs/common';

describe('DealEconomicsService', () => {
  let service: DealEconomicsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      deal: {
        findFirst: jest.fn(),
      },
      dealEconomics: {
        upsert: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      automationRun: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealEconomicsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<DealEconomicsService>(DealEconomicsService);
  });

  describe('computeMetrics', () => {
    it('should compute assignment fee based ROI', () => {
      const result = service.computeMetrics({
        assignmentFee: 25000,
        closingCosts: 2500,
        marketingCost: 500,
        smsCost: 12,
        aiCostAllocated: 1,
        laborCost: 200,
      });

      expect(result.grossRevenue).toBe(25000);
      expect(result.netProfit).toBe(25000 - 2500 - 500 - 12 - 1 - 200);
      expect(result.roiPercent).toBeGreaterThan(0);
    });

    it('should compute buy-sell ROI', () => {
      const result = service.computeMetrics({
        salePrice: 300000,
        purchasePrice: 200000,
        closingCosts: 10000,
        marketingCost: 5000,
      });

      expect(result.grossRevenue).toBe(100000);
      expect(result.netProfit).toBe(100000 - 10000 - 5000);
      expect(result.roiPercent).toBeCloseTo(
        ((100000 - 15000) / 15000) * 100,
        1,
      );
    });

    it('should compute assignment spread ROI', () => {
      const result = service.computeMetrics({
        assignmentPrice: 180000,
        contractPrice: 155000,
        closingCosts: 1000,
      });

      expect(result.grossRevenue).toBe(25000);
      expect(result.netProfit).toBe(24000);
    });

    it('should handle missing revenue data gracefully', () => {
      const result = service.computeMetrics({
        smsCost: 10,
        aiCostAllocated: 5,
      });

      expect(result.grossRevenue).toBeNull();
      expect(result.netProfit).toBeNull();
      expect(result.roiPercent).toBeNull();
    });

    it('should handle zero costs with non-null revenue', () => {
      const result = service.computeMetrics({
        assignmentFee: 10000,
      });

      expect(result.grossRevenue).toBe(10000);
      expect(result.netProfit).toBe(10000);
      expect(result.roiPercent).toBeNull(); // zero costs → no ROI %
    });
  });

  describe('upsert', () => {
    it('should create economics for existing deal', async () => {
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal-1', accountId: 'tenant-1' });
      prisma.dealEconomics.upsert.mockResolvedValue({
        id: 'econ-1',
        dealId: 'deal-1',
        grossRevenue: 25000,
        netProfit: 22000,
        roiPercent: 500,
      });

      const result = await service.upsert('deal-1', 'tenant-1', {
        assignmentFee: 25000,
        closingCosts: 3000,
      });

      expect(result.grossRevenue).toBe(25000);
      expect(prisma.dealEconomics.upsert).toHaveBeenCalled();
    });

    it('should throw for non-existent deal', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);

      await expect(
        service.upsert('missing', 'tenant-1', { assignmentFee: 1000 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('allocateAutomationCosts', () => {
    it('should sum costs from automation runs', async () => {
      prisma.automationRun.findMany.mockResolvedValue([
        { aiCostUsd: 0.01, messageCostUsd: 0.02, toolCostUsd: 0.005 },
        { aiCostUsd: 0.005, messageCostUsd: 0.01, toolCostUsd: 0 },
      ]);
      prisma.dealEconomics.findUnique.mockResolvedValue({
        dealId: 'deal-1',
        smsCost: 5,
      });
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal-1', accountId: 'tenant-1' });
      prisma.dealEconomics.upsert.mockResolvedValue({ id: 'econ-1' });

      await service.allocateAutomationCosts('deal-1', 'tenant-1');

      expect(prisma.automationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'tenant-1',
            entityType: 'deal',
            entityId: 'deal-1',
          },
        }),
      );
    });
  });
});
