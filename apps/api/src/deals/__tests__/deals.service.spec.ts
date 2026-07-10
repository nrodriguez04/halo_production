import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealsService } from '../deals.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { AutomationService } from '../../automation/automation.service';

describe('DealsService', () => {
  let service: DealsService;
  let prisma: any;

  const existingDeal = {
    id: 'deal-1',
    accountId: 'tenant-1',
    stage: 'new',
  };

  beforeEach(async () => {
    prisma = {
      deal: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      lead: {
        findFirst: jest.fn(),
      },
      property: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: TimelineService,
          useValue: { appendEvent: jest.fn() },
        },
        {
          provide: AutomationService,
          useValue: { attributeStageChange: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<DealsService>(DealsService);
  });

  describe('update', () => {
    it('rejects accountId rewrites through the generic update endpoint', async () => {
      await expect(
        service.update('deal-1', 'tenant-1', { accountId: 'tenant-2' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.deal.findFirst).not.toHaveBeenCalled();
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('rejects stage rewrites through the generic update endpoint', async () => {
      await expect(
        service.update('deal-1', 'tenant-1', { stage: 'closed' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.deal.findFirst).not.toHaveBeenCalled();
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('rejects relinking a deal to a lead outside the authenticated account', async () => {
      prisma.deal.findFirst.mockResolvedValue(existingDeal);
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.update('deal-1', 'tenant-1', { leadId: 'lead-foreign' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: { id: 'lead-foreign', accountId: 'tenant-1' },
      });
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('rejects relinking a deal to a property outside the authenticated account', async () => {
      prisma.deal.findFirst.mockResolvedValue(existingDeal);
      prisma.property.findFirst.mockResolvedValue(null);

      await expect(
        service.update('deal-1', 'tenant-1', { propertyId: 'prop-foreign' }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: { id: 'prop-foreign', accountId: 'tenant-1' },
      });
      expect(prisma.deal.update).not.toHaveBeenCalled();
    });

    it('allows safe same-tenant field updates after validating related records', async () => {
      prisma.deal.findFirst.mockResolvedValue(existingDeal);
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-2',
        accountId: 'tenant-1',
      });
      prisma.property.findFirst.mockResolvedValue({
        id: 'prop-2',
        accountId: 'tenant-1',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        leadId: 'lead-2',
        propertyId: 'prop-2',
        offerAmount: 123000,
      });

      const result = await service.update('deal-1', 'tenant-1', {
        leadId: 'lead-2',
        propertyId: 'prop-2',
        offerAmount: 123000,
      });

      expect(prisma.deal.update).toHaveBeenCalledWith({
        where: { id: 'deal-1' },
        data: {
          leadId: 'lead-2',
          propertyId: 'prop-2',
          offerAmount: 123000,
        },
        include: {
          lead: true,
          property: true,
          contracts: true,
        },
      });
      expect(result.offerAmount).toBe(123000);
    });

    it('throws not found when the caller does not own the deal', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);

      await expect(
        service.update('deal-1', 'tenant-1', { offerAmount: 123000 }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.deal.update).not.toHaveBeenCalled();
    });
  });
});
