import { hashEmail, hashPhone } from '@halo/shared';
import { OptOutService } from '../opt-out.service';
import { openValue } from '../../pii/contact-crypto';

describe('OptOutService', () => {
  let prisma: any;
  let service: OptOutService;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(() => {
    prisma = {
      dNCList: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      consent: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    service = new OptOutService(prisma);
  });

  it('records an email opt-out encrypted, keyed by its blind index', async () => {
    const out = await service.recordEmailOptOut({
      accountId: 'tenant-1',
      email: 'Seller@Example.com',
      leadId: 'lead-1',
      source: 'unsubscribe_link',
      reason: 'Unsubscribed via email link',
    });

    const call = prisma.dNCList.upsert.mock.calls[0][0];
    expect(call.where).toEqual({
      accountId_emailHash: {
        accountId: 'tenant-1',
        emailHash: hashEmail('seller@example.com'),
      },
    });
    expect(call.create).toEqual({
      accountId: 'tenant-1',
      emailEnc: expect.any(String),
      emailHash: hashEmail('seller@example.com'),
      source: 'unsubscribe_link',
      reason: 'Unsubscribed via email link',
    });
    expect(openValue(call.create.emailEnc)).toBe('Seller@Example.com');
    expect(JSON.stringify(call)).not.toContain('Seller@Example.com');
    expect(out).toEqual({ accountIds: ['tenant-1'], consentsRevoked: 2 });
  });

  it("revokes the tenant's email consents for the address and its lead", async () => {
    prisma.lead.findMany.mockResolvedValue([{ id: 'lead-2' }]);

    await service.recordEmailOptOut({
      accountId: 'tenant-1',
      email: 'seller@example.com',
      leadId: 'lead-1',
      source: 'unsubscribe_link',
      reason: 'x',
    });

    expect(prisma.consent.updateMany).toHaveBeenCalledWith({
      where: {
        accountId: 'tenant-1',
        revokedAt: null,
        channel: { in: ['email'] },
        OR: [
          { emailHash: hashEmail('seller@example.com') },
          { leadId: { in: ['lead-2', 'lead-1'] } },
        ],
      },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('writes an audit row without the contact', async () => {
    await service.recordPhoneOptOut({
      accountIds: ['tenant-1'],
      phone: '(512) 555-0100',
      source: 'stop_keyword',
      reason: 'Replied STOP',
    });

    expect(prisma.dNCList.upsert.mock.calls[0][0].create.phoneHash).toBe(
      hashPhone('+15125550100'),
    );
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toEqual({
      accountId: 'tenant-1',
      action: 'compliance.opt_out',
      resource: 'dnc_list',
      details: { channel: 'sms', source: 'stop_keyword', consentsRevoked: 2 },
    });
    expect(JSON.stringify(audit)).not.toContain('555');
  });

  it('keeps the opt-out when the audit write fails', async () => {
    prisma.auditLog.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.recordPhoneOptOut({
        accountIds: [],
        phone: '+15125550100',
        source: 'stop_keyword',
        reason: 'Replied STOP',
      }),
    ).resolves.toEqual({ accountIds: ['GLOBAL'], consentsRevoked: 0 });
    expect(prisma.dNCList.upsert).toHaveBeenCalledTimes(1);
  });

  it('ignores a blank contact', async () => {
    const out = await service.recordEmailOptOut({
      accountId: 'tenant-1',
      email: '   ',
      source: 'unsubscribe_link',
      reason: 'x',
    });
    expect(out).toEqual({ accountIds: [], consentsRevoked: 0 });
    expect(prisma.dNCList.upsert).not.toHaveBeenCalled();
  });
});
