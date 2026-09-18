import { Test, TestingModule } from '@nestjs/testing';
import { hashPhone } from '@halo/shared';
import { CommunicationsService } from '../communications.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { ComplianceService } from '../../compliance/compliance.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { protectContact } from '../../leads/lead-pii';
import { openCounterparty } from '../message-counterparty';

describe('CommunicationsService recipients', () => {
  let service: CommunicationsService;
  let prisma: any;
  let compliance: { getFacts: jest.Mock };

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    prisma = {
      lead: { findFirst: jest.fn() },
      message: {
        create: jest.fn(async (args: any) => ({ id: 'msg-1', ...args.data })),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    compliance = {
      getFacts: jest.fn().mockResolvedValue({
        isDnc: false,
        hasConsent: true,
        consentSource: 'form',
      }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: { appendEvent: jest.fn() } },
        { provide: ComplianceService, useValue: compliance },
        {
          provide: ControlPlaneService,
          useValue: {
            getStatus: jest.fn().mockResolvedValue({
              enabled: true,
              smsEnabled: true,
              emailEnabled: true,
            }),
          },
        },
        LeadPiiService,
      ],
    }).compile();
    service = module.get(CommunicationsService);
  });

  it('addresses a lead-linked SMS to the lead contact, encrypted, and strips metadata', async () => {
    prisma.lead.findFirst.mockResolvedValue({
      ...protectContact({ phone: '+15125550100', email: 'seller@example.com' }),
    });

    await service.create({
      accountId: 'tenant-1',
      leadId: 'lead-1',
      channel: 'sms',
      direction: 'outbound',
      content: 'hello',
      metadata: { to: '+19990000000', subject: 'x' },
    } as any);

    const data = prisma.message.create.mock.calls[0][0].data;
    // The caller-supplied number is ignored for a lead-linked message.
    expect(openCounterparty(data)).toBe('+15125550100');
    expect(data.counterpartyHash).toBe(hashPhone('+15125550100'));
    expect(data.metadata).toEqual({ subject: 'x' });
    expect(compliance.getFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        phone: '+15125550100',
        email: undefined,
        leadId: 'lead-1',
      }),
    );
  });

  it('uses the supplied address when there is no lead', async () => {
    await service.create({
      accountId: 'tenant-1',
      channel: 'email',
      direction: 'outbound',
      content: 'hello',
      metadata: { email: 'Buyer@Example.com' },
    } as any);

    const data = prisma.message.create.mock.calls[0][0].data;
    expect(openCounterparty(data)).toBe('Buyer@Example.com');
    expect(data.metadata).toEqual({});
    expect(compliance.getFacts).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'Buyer@Example.com', phone: undefined }),
    );
    expect(prisma.lead.findFirst).not.toHaveBeenCalled();
  });

  it('re-evaluates compliance at approval against the stored counterparty', async () => {
    const cols = (await import('../message-counterparty')).counterpartyColumns(
      'sms',
      '+15125550100',
    );
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg-1',
      accountId: 'tenant-1',
      channel: 'sms',
      direction: 'outbound',
      status: 'pending_approval',
      metadata: {},
      leadId: 'lead-1',
      ...cols,
    });
    prisma.message.update.mockResolvedValue({
      id: 'msg-1',
      status: 'approved',
    });

    await service.approve('msg-1', 'tenant-1', 'user-1');

    expect(compliance.getFacts).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+15125550100', channel: 'sms' }),
    );
  });
});
