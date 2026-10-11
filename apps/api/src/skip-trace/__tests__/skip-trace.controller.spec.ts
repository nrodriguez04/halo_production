import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { SkipTraceController } from '../skip-trace.controller';
import { SkipTraceService } from '../skip-trace.service';
import { LeadSkipTraceService } from '../lead-skip-trace.service';
import { PrismaService } from '../../prisma.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { hashPhone } from '@halo/shared';
import { openValue } from '../../pii/contact-crypto';

describe('SkipTraceController', () => {
  let controller: SkipTraceController;
  let service: { appendContacts: jest.Mock };
  let prisma: { lead: { findFirst: jest.Mock; updateMany: jest.Mock } };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    service = { appendContacts: jest.fn() };
    prisma = {
      lead: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lead-1',
          canonicalAddress: '1 Main St',
          canonicalCity: 'Austin',
          canonicalState: 'TX',
          canonicalZip: '78701',
          canonicalOwner: 'Jane Seller',
          score: 72,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkipTraceController],
      providers: [
        LeadSkipTraceService,
        { provide: SkipTraceService, useValue: service },
        { provide: PrismaService, useValue: prisma },
        LeadPiiService,
      ],
    }).compile();
    controller = module.get(SkipTraceController);
  });

  const body = { leadId: 'lead-1', propertyAddress: '1 Main St' };
  const matched = {
    provider: 'batch_skiptrace',
    status: 'matched' as const,
    phones: [
      { number: '+15125550100', type: 'mobile' as const, isDnc: false },
      { number: '+15125550101', type: 'landline' as const },
    ],
    emails: [{ email: 'seller@example.com' }],
    raw: { phones: ['+15125550100'], ssnLast4: '1234' },
    costUsd: 0.1,
  };

  it('returns masked previews only: no raw contacts, no provider payload', async () => {
    service.appendContacts.mockResolvedValue(matched);

    const out = await controller.appendContacts('tenant-1', 'user-1', body);

    expect(out).toEqual({
      provider: 'batch_skiptrace',
      status: 'matched',
      costUsd: 0.1,
      phones: [
        {
          masked: '••• ••• 0100',
          type: 'mobile',
          confidence: undefined,
          isDnc: false,
        },
        {
          masked: '••• ••• 0101',
          type: 'landline',
          confidence: undefined,
          isDnc: undefined,
        },
      ],
      emails: [{ masked: 's•••@example.com', confidence: undefined }],
      stored: { phone: true, email: true },
    });
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain('5550100');
    expect(serialised).not.toContain('seller@example.com');
    expect(serialised).not.toContain('raw');
  });

  it('persists the first contacts encrypted, only into empty fields, tenant-scoped', async () => {
    service.appendContacts.mockResolvedValue(matched);

    await controller.appendContacts('tenant-1', 'user-1', body);

    expect(prisma.lead.updateMany).toHaveBeenCalledTimes(2);
    const phoneCall = prisma.lead.updateMany.mock.calls[0][0];
    expect(phoneCall.where).toEqual({
      id: 'lead-1',
      accountId: 'tenant-1',
      canonicalPhoneEnc: null,
    });
    expect(phoneCall.data).not.toHaveProperty('canonicalPhone');
    expect(phoneCall.data.canonicalPhoneHash).toBe(hashPhone('+15125550100'));
    expect(openValue(phoneCall.data.canonicalPhoneEnc)).toBe('+15125550100');
  });

  it('runs as the user, without the automated score gate', async () => {
    service.appendContacts.mockResolvedValue({
      ...matched,
      phones: [],
      emails: [],
    });

    await controller.appendContacts('tenant-1', 'user-1', body);

    expect(service.appendContacts).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: 'lead-1',
        propertyAddress: '1 Main St',
      }),
      {
        accountId: 'tenant-1',
        actor: 'user',
        userId: 'user-1',
        leadId: 'lead-1',
      },
      undefined,
    );
  });

  it("refuses another tenant's lead before paying for a trace", async () => {
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(
      controller.appendContacts('tenant-2', 'user-1', body),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1', accountId: 'tenant-2' },
      }),
    );
    expect(service.appendContacts).not.toHaveBeenCalled();
  });

  it('writes nothing when the trace failed or found nothing', async () => {
    service.appendContacts.mockResolvedValueOnce({
      provider: 'batch_skiptrace',
      status: 'error',
      phones: [],
      emails: [],
    });
    await controller.appendContacts('tenant-1', 'user-1', body);
    service.appendContacts.mockResolvedValueOnce({
      provider: 'batch_skiptrace',
      status: 'no_match',
      phones: [],
      emails: [],
    });
    await controller.appendContacts('tenant-1', 'user-1', body);

    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});
