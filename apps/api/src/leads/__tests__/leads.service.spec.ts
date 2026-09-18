import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { LeadsService } from '../leads.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { LeadPiiService } from '../lead-pii.service';
import { hashEmail, hashPhone } from '@halo/shared';

describe('LeadsService', () => {
  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

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
        LeadPiiService,
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
      // Inherited contact fields are written protected: plaintext (dual-write)
      // plus ciphertext and blind index.
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
          canonicalPhoneEnc: expect.any(String),
          canonicalEmailEnc: expect.any(String),
          canonicalPhoneHash: hashPhone('+15555550123'),
          canonicalEmailHash: hashEmail('jane@example.com'),
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

  describe('update', () => {
    it('rejects accountId rewrites through the generic update endpoint', async () => {
      await expect(
        service.update('lead-1', 'tenant-1', { accountId: 'tenant-2' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('rejects status changes through the generic update endpoint', async () => {
      await expect(
        service.update('lead-1', 'tenant-1', { status: 'qualified' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('allows ordinary field updates on an owned lead', async () => {
      prisma.lead.findFirst.mockResolvedValueOnce({
        id: 'lead-1',
        accountId: 'tenant-1',
      });
      prisma.lead.update.mockResolvedValueOnce({ id: 'lead-1' });
      await service.update('lead-1', 'tenant-1', {
        canonicalOwner: 'New Owner',
      } as any);
      expect(prisma.lead.update).toHaveBeenCalledWith({
        where: { id: 'lead-1' },
        data: { canonicalOwner: 'New Owner' },
      });
    });
  });

  describe('importCSV', () => {
    const rows = [
      { address: '1 Good St', city: 'Austin', state: 'TX', zip: '78701' },
      { address: '2 Dupe St', city: 'Austin', state: 'TX', zip: '78701' },
      { address: '3 Bad St', city: 'Austin', state: 'TX', zip: '78701' },
    ] as any[];

    it('uses a single batch insert when every row is accepted', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([]);
      prisma.lead.createMany = jest.fn().mockResolvedValue({ count: 3 });
      const out = await service.importCSV(rows, 'tenant-1', 'user-1');
      expect(out.created).toBe(3);
      expect(prisma.lead.create).not.toHaveBeenCalled();
    });

    it('falls back to per-row inserts so one bad row cannot abort the file', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([]);
      prisma.lead.createMany = jest
        .fn()
        .mockRejectedValue(new Error('value too long'));
      prisma.lead.create
        .mockResolvedValueOnce({ id: 'l1' })
        .mockRejectedValueOnce(
          Object.assign(new Error('unique'), { code: 'P2002' }),
        )
        .mockRejectedValueOnce(new Error('value too long for column'));

      const out = await service.importCSV(rows, 'tenant-1', 'user-1');

      expect(prisma.lead.create).toHaveBeenCalledTimes(3);
      expect(out.created).toBe(1);
      expect(out.duplicates).toBe(1);
      expect(out.errors).toEqual([expect.stringContaining('3 Bad St')]);
    });
  });

  describe('contact PII dual-write', () => {
    it('create writes plaintext, ciphertext and blind index for phone and email', async () => {
      prisma.lead.create.mockResolvedValueOnce({
        id: 'lead-1',
        accountId: 'tenant-1',
        status: 'new',
      });

      await service.create(
        {
          accountId: 'tenant-1',
          canonicalAddress: '1 Main St',
          canonicalPhone: '(512) 555-0100',
          canonicalEmail: 'Seller@Example.com',
          status: 'new',
          tags: [],
        } as any,
        'user-1',
      );

      const data = prisma.lead.create.mock.calls[0][0].data;
      expect(data.canonicalPhone).toBe('(512) 555-0100');
      expect(data.canonicalPhoneHash).toBe(hashPhone('+15125550100'));
      expect(data.canonicalEmailHash).toBe(hashEmail('seller@example.com'));
      expect(JSON.parse(data.canonicalPhoneEnc)).toEqual(
        expect.objectContaining({
          ciphertext: expect.any(String),
          keyVersion: 1,
        }),
      );
      expect(data.canonicalEmailEnc).toEqual(expect.any(String));
    });

    it('update protects only the contact fields that were sent', async () => {
      prisma.lead.findFirst.mockResolvedValueOnce({
        id: 'lead-1',
        accountId: 'tenant-1',
      });
      prisma.lead.update.mockResolvedValueOnce({ id: 'lead-1' });

      await service.update('lead-1', 'tenant-1', {
        canonicalPhone: '+15125550100',
      } as any);

      const data = prisma.lead.update.mock.calls[0][0].data;
      expect(data.canonicalPhoneHash).toBe(hashPhone('+15125550100'));
      expect(data.canonicalPhoneEnc).toEqual(expect.any(String));
      expect(data).not.toHaveProperty('canonicalEmailEnc');
      expect(data).not.toHaveProperty('canonicalEmailHash');
    });

    it('CSV import rows carry the protected columns', async () => {
      prisma.lead.findMany.mockResolvedValueOnce([]);
      prisma.lead.createMany = jest.fn().mockResolvedValue({ count: 1 });

      await service.importCSV(
        [
          {
            address: '9 Elm St',
            city: 'Austin',
            state: 'TX',
            zip: '78701',
            phone: '512-555-0100',
            email: 'a@b.co',
          },
        ] as any,
        'tenant-1',
        'user-1',
      );

      const row = prisma.lead.createMany.mock.calls[0][0].data[0];
      expect(row.canonicalPhone).toBe('512-555-0100');
      expect(row.canonicalPhoneHash).toBe(hashPhone('512-555-0100'));
      expect(row.canonicalEmailHash).toBe(hashEmail('a@b.co'));
      expect(row.canonicalPhoneEnc).toEqual(expect.any(String));
    });
  });
});
