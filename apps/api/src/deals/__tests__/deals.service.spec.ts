import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { DealsService } from '../deals.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { AutomationService } from '../../automation/automation.service';

describe('DealsService', () => {
  let service: DealsService;
  let prisma: any;
  let timelineService: any;
  let automationService: any;

  beforeEach(async () => {
    prisma = {
      deal: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      lead: {
        findFirst: jest.fn(),
      },
      property: {
        findFirst: jest.fn(),
      },
    };

    timelineService = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    automationService = {
      attributeStageChange: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: timelineService },
        { provide: AutomationService, useValue: automationService },
      ],
    }).compile();

    service = module.get<DealsService>(DealsService);
  });

  describe('create', () => {
    it('rejects cross-tenant lead links', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          accountId: 'account-1',
          leadId: 'lead-foreign',
          stage: 'new',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.deal.create).not.toHaveBeenCalled();
      expect(timelineService.appendEvent).not.toHaveBeenCalled();
    });

    it('rejects cross-tenant property links', async () => {
      prisma.property.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          accountId: 'account-1',
          propertyId: 'property-foreign',
          stage: 'new',
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.deal.create).not.toHaveBeenCalled();
      expect(timelineService.appendEvent).not.toHaveBeenCalled();
    });

    it('creates deals when linked records belong to the same tenant', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
      prisma.deal.create.mockResolvedValue({
        id: 'deal-1',
        accountId: 'account-1',
        stage: 'new',
      });

      const data = {
        accountId: 'account-1',
        leadId: 'lead-1',
        propertyId: 'property-1',
        stage: 'new' as const,
      };

      const result = await service.create(data, 'user-1');

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'lead-1',
          accountId: 'account-1',
        },
        select: { id: true },
      });
      expect(prisma.property.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'property-1',
          accountId: 'account-1',
        },
        select: { id: true },
      });
      expect(prisma.deal.create).toHaveBeenCalledWith({
        data,
        include: {
          lead: true,
          property: true,
          contracts: true,
        },
      });
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'account-1',
          entityId: 'deal-1',
          eventType: 'DEAL_CREATED',
          actorId: 'user-1',
          payload: { stage: 'new' },
        }),
      );
      expect(result.id).toBe('deal-1');
    });
  });
});
