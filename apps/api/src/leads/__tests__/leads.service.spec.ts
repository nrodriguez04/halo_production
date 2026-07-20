import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from '../leads.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';

describe('LeadsService', () => {
  let service: LeadsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lead: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      sourceRecord: { updateMany: jest.fn() },
      property: { updateMany: jest.fn() },
      deal: { updateMany: jest.fn() },
      consent: { updateMany: jest.fn() },
      message: { updateMany: jest.fn() },
      pIIEnvelope: { updateMany: jest.fn() },
      leadEnrichmentJob: { updateMany: jest.fn() },
      integrationCostEvent: { updateMany: jest.fn() },
      jobRun: { updateMany: jest.fn() },
      automationRun: { updateMany: jest.fn() },
      timelineEvent: { updateMany: jest.fn() },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (callback: (tx: any) => Promise<unknown>) =>
        callback(prisma),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: { appendEvent: jest.fn() } },
      ],
    }).compile();

    service = module.get<LeadsService>(LeadsService);
  });

  describe('mergeLeads', () => {
    it('rejects self-merges before touching the database', async () => {
      await expect(
        service.mergeLeads('lead-1', 'lead-1', 'acc-1', 'user-1'),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.lead.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reparents lead-linked records before deleting the source lead', async () => {
      prisma.lead.findFirst
        .mockResolvedValueOnce({
          id: 'lead-source',
          accountId: 'acc-1',
          canonicalAddress: '123 Main St',
          canonicalCity: 'Dallas',
          canonicalState: 'TX',
          canonicalZip: '75001',
          canonicalOwner: 'Jane Seller',
          canonicalPhone: '+15555550123',
          canonicalEmail: 'jane@example.com',
          sourceRecords: [],
          properties: [],
          deals: [],
        })
        .mockResolvedValueOnce({
          id: 'lead-target',
          accountId: 'acc-1',
          canonicalAddress: null,
          canonicalCity: null,
          canonicalState: null,
          canonicalZip: null,
          canonicalOwner: null,
          canonicalPhone: null,
          canonicalEmail: null,
          sourceRecords: [],
          properties: [],
          deals: [],
        });

      prisma.lead.update.mockResolvedValue({ id: 'lead-target' });
      prisma.lead.delete.mockResolvedValue({ id: 'lead-source' });
      prisma.auditLog.create.mockResolvedValue({ id: 'audit-1' });

      const result = await service.mergeLeads(
        'lead-source',
        'lead-target',
        'acc-1',
        'user-1',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.sourceRecord.updateMany).toHaveBeenCalledWith({
        where: { leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.property.updateMany).toHaveBeenCalledWith({
        where: { leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.deal.updateMany).toHaveBeenCalledWith({
        where: { leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.consent.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.message.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.pIIEnvelope.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.leadEnrichmentJob.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.integrationCostEvent.updateMany).toHaveBeenCalledWith({
        where: { accountId: 'acc-1', leadId: 'lead-source' },
        data: { leadId: 'lead-target' },
      });
      expect(prisma.jobRun.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'acc-1',
          entityType: 'LEAD',
          entityId: 'lead-source',
        },
        data: { entityId: 'lead-target' },
      });
      expect(prisma.automationRun.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'acc-1',
          entityType: { in: ['lead', 'LEAD'] },
          entityId: 'lead-source',
        },
        data: { entityId: 'lead-target' },
      });
      expect(prisma.timelineEvent.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: 'acc-1',
          entityType: 'LEAD',
          entityId: 'lead-source',
        },
        data: { entityId: 'lead-target' },
      });
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-target' },
        data: {
          canonicalAddress: '123 Main St',
          canonicalCity: 'Dallas',
          canonicalState: 'TX',
          canonicalZip: '75001',
          canonicalOwner: 'Jane Seller',
          canonicalPhone: '+15555550123',
          canonicalEmail: 'jane@example.com',
        },
      });
      expect(prisma.lead.delete).toHaveBeenCalledWith({
        where: { id: 'lead-source' },
      });
      expect(prisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            accountId: 'acc-1',
            action: 'lead.merge',
            resource: 'lead:lead-target',
            userId: 'user-1',
          }),
        }),
      );
      expect(result).toEqual({ success: true, mergedInto: 'lead-target' });
    });
  });
});
