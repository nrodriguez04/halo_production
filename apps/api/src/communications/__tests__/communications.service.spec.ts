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
        findFirst: jest.fn(),
      },
      dNCList: {
        findFirst: jest.fn(),
      },
      consent: {
        findFirst: jest.fn(),
      },
      quietHours: {
        findFirst: jest.fn(),
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

  describe('approve', () => {
    it('rejects re-approval when Twilio has already accepted the outbound SMS', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'acc-1',
        channel: 'sms',
        direction: 'outbound',
        status: 'pending_approval',
        leadId: 'lead-1',
        metadata: {
          phone: '+15555550100',
          twilioMessageSid: 'SM123',
        },
      });

      await expect(
        service.approve('msg-1', 'acc-1', 'user-1'),
      ).rejects.toThrow('Message has already been handed to the provider');
    });

    it('approves pending messages that have not been handed to a provider yet', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'msg-1',
        accountId: 'acc-1',
        channel: 'sms',
        direction: 'outbound',
        status: 'pending_approval',
        leadId: 'lead-1',
        metadata: {
          phone: '+15555550100',
        },
      });
      prisma.message.update.mockResolvedValue({
        id: 'msg-1',
        accountId: 'acc-1',
        channel: 'sms',
        direction: 'outbound',
        status: 'approved',
      });

      jest
        .spyOn(service as any, 'getControlPlane')
        .mockResolvedValue({ enabled: true, smsEnabled: true, emailEnabled: true });
      jest
        .spyOn(service as any, 'getComplianceFacts')
        .mockResolvedValue({ isDnc: false, hasConsent: true });

      const queueService = {
        enqueueCommunication: jest.fn().mockResolvedValue(undefined),
      };

      const result = await service.approve('msg-1', 'acc-1', 'user-1', queueService);

      expect(result.status).toBe('approved');
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            status: 'approved',
            approvedBy: 'user-1',
          }),
        }),
      );
      expect(queueService.enqueueCommunication).toHaveBeenCalledWith('msg-1');
      expect(timelineService.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'MESSAGE_APPROVED',
          entityId: 'msg-1',
        }),
      );
    });
  });
});
