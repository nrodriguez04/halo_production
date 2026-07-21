import { ForbiddenException, NotFoundException } from '@nestjs/common';
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
      controlPlane: {
        findFirst: jest.fn().mockResolvedValue({
          enabled: true,
          smsEnabled: true,
          emailEnabled: true,
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
      lead: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      deal: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      message: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
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

  it('blocks outbound SMS to DNC numbers when the recipient is stored in metadata.to', async () => {
    prisma.dNCList.findFirst.mockResolvedValue({ id: 'dnc-1' });

    await expect(
      service.create({
        accountId: 'tenant-1',
        channel: 'sms',
        direction: 'outbound',
        content: 'Hello there',
        metadata: { to: '(555) 123-4567' },
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.dNCList.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: 'tenant-1',
        phone: '+15551234567',
      },
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('rejects outbound messages that reference a lead outside the tenant', async () => {
    await expect(
      service.create({
        accountId: 'tenant-1',
        leadId: 'lead-foreign',
        channel: 'sms',
        direction: 'outbound',
        content: 'Hello there',
        metadata: { to: '+15557654321' },
      }),
    ).rejects.toThrow(NotFoundException);

    expect(prisma.lead.findFirst).toHaveBeenCalledWith({
      where: { id: 'lead-foreign', accountId: 'tenant-1' },
      select: {
        id: true,
        canonicalPhone: true,
        canonicalEmail: true,
      },
    });
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it('does not treat lead-only consent as approval to text a different phone number', async () => {
    prisma.message.findFirst.mockResolvedValue({
      id: 'msg-1',
      accountId: 'tenant-1',
      status: 'pending_approval',
      channel: 'sms',
      direction: 'outbound',
      leadId: 'lead-1',
      metadata: { to: '+15557654321' },
    });
    prisma.lead.findFirst.mockResolvedValue({
      id: 'lead-1',
      canonicalPhone: '+15551234567',
      canonicalEmail: null,
    });

    await expect(
      service.approve('msg-1', 'tenant-1', 'user-1'),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.consent.findFirst).toHaveBeenCalledWith({
      where: {
        accountId: 'tenant-1',
        channel: 'sms',
        revokedAt: null,
        OR: [{ phone: '+15557654321' }],
      },
      orderBy: { grantedAt: 'desc' },
    });
    expect(prisma.message.update).not.toHaveBeenCalled();
  });
});
