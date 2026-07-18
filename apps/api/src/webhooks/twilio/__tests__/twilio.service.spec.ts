import { Test, TestingModule } from '@nestjs/testing';
import { TwilioService } from '../twilio.service';
import { PrismaService } from '../../../prisma.service';
import { AutomationService } from '../../../automation/automation.service';

describe('TwilioService', () => {
  let service: TwilioService;
  let prisma: any;
  let automationService: any;

  beforeEach(async () => {
    prisma = {
      message: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(async (args: any) => ({
          id: 'msg-inbound-1',
          ...args.data,
        })),
      },
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      dNCList: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'dnc-1' }),
      },
    };

    automationService = {
      attributeReply: jest.fn().mockResolvedValue({ attributed: false }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioService,
        { provide: PrismaService, useValue: prisma },
        { provide: AutomationService, useValue: automationService },
      ],
    }).compile();

    service = module.get<TwilioService>(TwilioService);
  });

  it('routes inbound replies to the unique matching tenant', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);

    await service.handleInbound({
      From: '+15551234567',
      To: '+15550000000',
      Body: 'hello there',
      MessageSid: 'SM123',
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'tenant-a',
          direction: 'inbound',
          channel: 'sms',
        }),
      }),
    );
    expect(automationService.attributeReply).toHaveBeenCalledWith(
      'msg-inbound-1',
      'tenant-a',
    );
  });

  it('fails closed when outbound history matches multiple tenants', async () => {
    prisma.message.findMany.mockResolvedValueOnce([
      { accountId: 'tenant-a' },
      { accountId: 'tenant-b' },
    ]);

    await service.handleInbound({
      From: '+15551234567',
      To: '+15550000000',
      Body: 'this should not leak',
      MessageSid: 'SM456',
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'unknown',
        }),
      }),
    );
    expect(automationService.attributeReply).toHaveBeenCalledWith(
      'msg-inbound-1',
      'unknown',
    );
  });

  it('fails closed when outbound and lead ownership disagree', async () => {
    prisma.message.findMany.mockResolvedValueOnce([{ accountId: 'tenant-a' }]);
    prisma.lead.findMany.mockResolvedValueOnce([{ accountId: 'tenant-b' }]);

    await service.handleInbound({
      From: '+15551234567',
      To: '+15550000000',
      Body: 'conflicting ownership',
      MessageSid: 'SM789',
    });

    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'unknown',
        }),
      }),
    );
  });

  it('quarantines STOP replies when sender ownership is ambiguous', async () => {
    prisma.message.findMany.mockResolvedValueOnce([
      { accountId: 'tenant-a' },
      { accountId: 'tenant-b' },
    ]);

    await service.handleInbound({
      From: '+15551234567',
      To: '+15550000000',
      Body: 'STOP',
      MessageSid: 'SM999',
    });

    expect(prisma.dNCList.findFirst).toHaveBeenCalledWith({
      where: { accountId: 'unknown', phone: '+15551234567' },
    });
    expect(prisma.dNCList.create).toHaveBeenCalledWith({
      data: {
        accountId: 'unknown',
        phone: '+15551234567',
        source: 'stop_keyword',
        reason: 'User sent STOP keyword',
      },
    });
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountId: 'unknown',
          direction: 'inbound',
        }),
      }),
    );
    expect(automationService.attributeReply).not.toHaveBeenCalled();
  });
});
