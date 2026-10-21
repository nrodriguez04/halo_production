import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DealsService } from '../deals.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { AutomationService } from '../../automation/automation.service';
import { PIIService } from '../../pii/pii.service';
import { QueueService } from '../../queues/queue.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { DispositionEligibilityService } from '../../disposition/eligibility.service';

describe('DealsService', () => {
  let service: DealsService;
  let prisma: any;
  let timelineService: any;
  let automationService: any;
  let queueService: any;
  let controlPlaneService: any;
  let eligibility: any;

  const existingDeal = {
    id: 'deal-1',
    accountId: 'tenant-1',
    stage: 'new',
  };

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
      assignmentAgreement: { findFirst: jest.fn() },
      closingFile: { findFirst: jest.fn() },
      controlPlane: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ defaultAssignmentFee: 10000 }),
      },
    };

    timelineService = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    automationService = {
      attributeStageChange: jest.fn(),
    };
    queueService = { enqueueAgent: jest.fn().mockResolvedValue({}) };
    controlPlaneService = { isEnabled: jest.fn().mockResolvedValue(true) };
    eligibility = {
      assertEligible: jest.fn().mockResolvedValue({ status: 'eligible' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: timelineService },
        { provide: AutomationService, useValue: automationService },
        { provide: QueueService, useValue: queueService },
        { provide: ControlPlaneService, useValue: controlPlaneService },
        { provide: DispositionEligibilityService, useValue: eligibility },
        PIIService,
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

  describe('updateStage', () => {
    it('queues the Deal Underwriter when a deal reaches contacted', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'new',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'contacted',
        updatedAt: new Date('2026-10-12T10:00:00.000Z'),
      });

      await service.updateStage('deal-1', 'tenant-1', 'contacted', 'user-1');

      expect(queueService.enqueueAgent).toHaveBeenCalledWith({
        agent: 'deal_underwriter',
        accountId: 'tenant-1',
        entityType: 'deal',
        entityId: 'deal-1',
        trigger: 'lifecycle',
        triggerEventId: 'stage:contacted:2026-10-12T10:00:00.000Z',
      });
    });

    it('queues the Disposition Matcher when marketing starts, not when the contract is only sent', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'negotiating',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'under_contract',
        updatedAt: new Date('2026-10-12T11:00:00.000Z'),
      });
      await service.updateStage(
        'deal-1',
        'tenant-1',
        'under_contract',
        'user-1',
      );
      expect(queueService.enqueueAgent).not.toHaveBeenCalled();

      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'under_contract',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'marketing',
        updatedAt: new Date('2026-10-12T12:00:00.000Z'),
      });
      await service.updateStage('deal-1', 'tenant-1', 'marketing', null);

      expect(queueService.enqueueAgent).toHaveBeenCalledWith({
        agent: 'disposition_matcher',
        accountId: 'tenant-1',
        entityType: 'deal',
        entityId: 'deal-1',
        trigger: 'lifecycle',
        triggerEventId: 'stage:marketing:2026-10-12T12:00:00.000Z',
      });
    });

    it('refuses marketing until the disposition gate passes, before anything changes', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'under_contract',
      });
      eligibility.assertEligible.mockRejectedValueOnce(
        new BadRequestException(
          'Needs review before disposition: Terms verified by a person.',
        ),
      );
      await expect(
        service.updateStage('deal-1', 'tenant-1', 'marketing', 'user-1'),
      ).rejects.toThrow('Terms verified');
      expect(eligibility.assertEligible).toHaveBeenCalledWith(
        'tenant-1',
        'deal-1',
        'buyer marketing',
      );
      expect(prisma.deal.update).not.toHaveBeenCalled();
      expect(queueService.enqueueAgent).not.toHaveBeenCalled();
    });

    it('assigns only with an executed assignment and closes only with a confirmed closing', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'marketing',
      });
      prisma.assignmentAgreement.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStage('deal-1', 'tenant-1', 'assigned', 'user-1'),
      ).rejects.toThrow('assignment agreement is executed');

      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'assigned',
      });
      prisma.closingFile.findFirst.mockResolvedValue(null);
      await expect(
        service.updateStage('deal-1', 'tenant-1', 'closed', 'user-1'),
      ).rejects.toThrow('closing is confirmed');
      expect(prisma.deal.update).not.toHaveBeenCalled();

      prisma.closingFile.findFirst.mockResolvedValue({ id: 'cf-1' });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'closed',
        updatedAt: new Date(),
      });
      await service.updateStage('deal-1', 'tenant-1', 'closed', 'user-1');
      expect(prisma.closingFile.findFirst).toHaveBeenLastCalledWith({
        where: { accountId: 'tenant-1', dealId: 'deal-1', status: 'closed' },
        select: { id: true },
      });
    });

    it('leaves the Underwriter alone for other stages and when the control plane is off', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'new',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'lost',
        updatedAt: new Date(),
      });
      await service.updateStage('deal-1', 'tenant-1', 'lost', 'user-1');
      expect(queueService.enqueueAgent).not.toHaveBeenCalled();

      controlPlaneService.isEnabled.mockResolvedValue(false);
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'contacted',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'negotiating',
        updatedAt: new Date(),
      });
      await service.updateStage('deal-1', 'tenant-1', 'negotiating', 'user-1');
      expect(queueService.enqueueAgent).not.toHaveBeenCalled();
    });

    it('never fails a stage change because the queue is down', async () => {
      queueService.enqueueAgent.mockRejectedValue(new Error('redis down'));
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        stage: 'new',
      });
      prisma.deal.update.mockResolvedValue({
        ...existingDeal,
        stage: 'contacted',
        updatedAt: new Date(),
      });
      await expect(
        service.updateStage('deal-1', 'tenant-1', 'contacted', 'user-1'),
      ).resolves.toMatchObject({ stage: 'contacted' });
    });
  });

  describe('findOne', () => {
    it("returns the buyers' price: the offer to the seller plus the tenant fee", async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        offerAmount: 72000,
        mao: 78400,
        lead: null,
        economics: null,
      });
      const deal: any = await service.findOne('deal-1', 'tenant-1');
      expect(deal.buyerPrice).toEqual({
        price: 82000,
        basis: 'offer',
        sellerPrice: 72000,
        fee: 10000,
      });
      expect(prisma.controlPlane.findUnique).toHaveBeenCalledWith({
        where: { accountId: 'tenant-1' },
        select: { defaultAssignmentFee: true },
      });
    });

    it('returns the price a person set on the deal economics', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        ...existingDeal,
        offerAmount: 72000,
        lead: null,
        economics: { assignmentPrice: 89500 },
      });
      const deal: any = await service.findOne('deal-1', 'tenant-1');
      expect(deal.buyerPrice).toMatchObject({
        price: 89500,
        basis: 'asking_price',
      });
    });
  });
});
