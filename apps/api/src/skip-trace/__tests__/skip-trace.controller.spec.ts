import { Test, TestingModule } from '@nestjs/testing';
import { SkipTraceController } from '../skip-trace.controller';
import { SkipTraceService } from '../skip-trace.service';
import { PrismaService } from '../../prisma.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { hashPhone } from '@halo/shared';

describe('SkipTraceController', () => {
  let controller: SkipTraceController;
  let service: { appendContacts: jest.Mock };
  let prisma: { lead: { updateMany: jest.Mock } };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    service = { appendContacts: jest.fn() };
    prisma = {
      lead: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkipTraceController],
      providers: [
        { provide: SkipTraceService, useValue: service },
        { provide: PrismaService, useValue: prisma },
        LeadPiiService,
      ],
    }).compile();
    controller = module.get(SkipTraceController);
  });

  const body = { leadId: 'lead-1', propertyAddress: '1 Main St' };

  it('persists returned contacts encrypted, only into empty fields, tenant-scoped', async () => {
    service.appendContacts.mockResolvedValue({
      provider: 'batch',
      status: 'ok',
      phones: [{ number: '+15125550100' }],
      emails: [],
    });

    const out = await controller.appendContacts('tenant-1', 'user-1', body);

    expect(out.status).toBe('ok');
    expect(prisma.lead.updateMany).toHaveBeenCalledTimes(1);
    const call = prisma.lead.updateMany.mock.calls[0][0];
    expect(call.where).toEqual({
      id: 'lead-1',
      accountId: 'tenant-1',
      canonicalPhone: null,
    });
    expect(call.data.canonicalPhone).toBe('+15125550100');
    expect(call.data.canonicalPhoneHash).toBe(hashPhone('+15125550100'));
    expect(call.data.canonicalPhoneEnc).toEqual(expect.any(String));
  });

  it('writes nothing when the trace failed or found nothing', async () => {
    service.appendContacts.mockResolvedValueOnce({
      provider: 'batch',
      status: 'error',
      phones: [],
      emails: [],
    });
    await controller.appendContacts('tenant-1', 'user-1', body);
    service.appendContacts.mockResolvedValueOnce({
      provider: 'batch',
      status: 'ok',
      phones: [],
      emails: [],
    });
    await controller.appendContacts('tenant-1', 'user-1', body);

    expect(prisma.lead.updateMany).not.toHaveBeenCalled();
  });
});
