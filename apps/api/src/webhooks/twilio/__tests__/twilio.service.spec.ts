import { Test, TestingModule } from '@nestjs/testing';
import { TwilioService } from '../twilio.service';
import { PrismaService } from '../../../prisma.service';
import { AutomationService } from '../../../automation/automation.service';

describe('TwilioService', () => {
  let service: TwilioService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      message: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwilioService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: AutomationService,
          useValue: { attributeReply: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TwilioService>(TwilioService);
  });

  describe('handleStatus', () => {
    it('treats queued callbacks as sent so provider-accepted SMS never reopens approval', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          status: 'approved',
          metadata: { twilioMessageSid: 'SM123' },
        },
      ]);
      prisma.message.update.mockResolvedValue({});

      await service.handleStatus({
        MessageSid: 'SM123',
        MessageStatus: 'queued',
      });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            status: 'sent',
            metadata: expect.objectContaining({
              twilioMessageSid: 'SM123',
              deliveryStatus: 'queued',
            }),
          }),
        }),
      );
    });

    it('keeps delivered messages delivered when Twilio retries an older queued callback', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          status: 'delivered',
          metadata: {
            twilioMessageSid: 'SM123',
            deliveryStatus: 'delivered',
          },
        },
      ]);
      prisma.message.update.mockResolvedValue({});

      await service.handleStatus({
        MessageSid: 'SM123',
        MessageStatus: 'queued',
      });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            status: 'delivered',
            metadata: expect.objectContaining({
              twilioMessageSid: 'SM123',
              deliveryStatus: 'queued',
            }),
          }),
        }),
      );
    });

    it('records Twilio delivery failures for messages that had only reached approval', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          status: 'approved',
          metadata: { twilioMessageSid: 'SM123' },
        },
      ]);
      prisma.message.update.mockResolvedValue({});

      await service.handleStatus({
        MessageSid: 'SM123',
        MessageStatus: 'undelivered',
      });

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'msg-1' },
          data: expect.objectContaining({
            status: 'failed',
            metadata: expect.objectContaining({
              twilioMessageSid: 'SM123',
              deliveryStatus: 'undelivered',
            }),
          }),
        }),
      );
    });
  });
});
