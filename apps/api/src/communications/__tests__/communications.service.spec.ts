import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CommunicationsService } from '../communications.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';

describe('CommunicationsService', () => {
  let service: CommunicationsService;
  let prisma: any;
  let timelineService: any;

  beforeEach(async () => {
    prisma = {
      message: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      controlPlane: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: true,
          smsEnabled: true,
          emailEnabled: true,
          docusignEnabled: true,
          externalDataEnabled: true,
        }),
      },
      dNCList: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      consent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      quietHours: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue({ leadId: 'lead-1' }),
      },
    };

    timelineService = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommunicationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: timelineService },
      ],
    }).compile();

    service = module.get<CommunicationsService>(CommunicationsService);
  });

  it('blocks approval for OpenClaw SMS messages when the recipient is on DNC', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg-1',
      accountId: 'tenant-1',
      dealId: 'deal-1',
      leadId: null,
      status: 'pending_approval',
      channel: 'sms',
      metadata: { to: '(555) 111-2222' },
    });
    prisma.dNCList.findFirst.mockResolvedValue({
      id: 'dnc-1',
      phone: '+15551112222',
    });

    await expect(
      service.approve('msg-1', 'tenant-1', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.dNCList.findFirst).toHaveBeenCalledWith({
      where: { phone: '+15551112222' },
    });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it('blocks approval for OpenClaw email messages when derived lead consent is missing', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg-2',
      accountId: 'tenant-1',
      dealId: 'deal-1',
      leadId: null,
      status: 'pending_approval',
      channel: 'email',
      metadata: { to: 'seller@example.com', subject: 'Follow up' },
    });
    prisma.deal.findFirst.mockResolvedValue({ leadId: 'lead-1' });
    prisma.consent.findFirst.mockResolvedValue(null);

    await expect(
      service.approve('msg-2', 'tenant-1', 'user-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(prisma.deal.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'deal-1',
        accountId: 'tenant-1',
      },
      select: { leadId: true },
    });
    expect(prisma.consent.findFirst).toHaveBeenCalledWith({
      where: {
        leadId: 'lead-1',
        channel: 'email',
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});
