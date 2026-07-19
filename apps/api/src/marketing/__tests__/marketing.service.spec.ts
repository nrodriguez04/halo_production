import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MarketingService } from '../marketing.service';
import { PrismaService } from '../../prisma.service';
import { QueueService } from '../../queues/queue.service';
import { TimelineService } from '../../timeline/timeline.service';

describe('MarketingService', () => {
  let service: MarketingService;
  let prisma: any;
  let queueService: any;
  let timelineService: any;

  const aiDisabledControlPlane = {
    enabled: true,
    smsEnabled: true,
    emailEnabled: true,
    docusignEnabled: true,
    externalDataEnabled: true,
    aiEnabled: false,
  };

  beforeEach(async () => {
    prisma = {
      deal: {
        findFirst: jest.fn(),
      },
      controlPlane: {
        findFirst: jest.fn(),
      },
      aICostLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      jobRun: {
        create: jest.fn(),
      },
      marketingMaterial: {
        findFirst: jest.fn(),
      },
    };

    queueService = {
      enqueueMarketing: jest.fn(),
    };

    timelineService = {
      appendEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MarketingService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
        { provide: TimelineService, useValue: timelineService },
      ],
    }).compile();

    service = module.get<MarketingService>(MarketingService);
  });

  describe('generateFlyer', () => {
    it('rejects when AI is disabled even if external data remains enabled', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        accountId: 'tenant-1',
      });
      prisma.controlPlane.findFirst.mockResolvedValue(aiDisabledControlPlane);

      await expect(
        service.generateFlyer('tenant-1', 'user-1', 'deal-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_DISABLED' }),
      });

      expect(prisma.jobRun.create).not.toHaveBeenCalled();
      expect(queueService.enqueueMarketing).not.toHaveBeenCalled();
      expect(timelineService.appendEvent).not.toHaveBeenCalled();
    });
  });

  describe('generateBuyerBlast', () => {
    it('rejects when AI is disabled even if external data remains enabled', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        accountId: 'tenant-1',
      });
      prisma.controlPlane.findFirst.mockResolvedValue(aiDisabledControlPlane);

      await expect(
        service.generateBuyerBlast('tenant-1', 'user-1', 'deal-1', ['buyer-1']),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_DISABLED' }),
      });

      expect(prisma.jobRun.create).not.toHaveBeenCalled();
      expect(queueService.enqueueMarketing).not.toHaveBeenCalled();
      expect(timelineService.appendEvent).not.toHaveBeenCalled();
    });
  });

  describe('generateVideoScript', () => {
    it('rejects when AI is disabled even if external data remains enabled', async () => {
      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        accountId: 'tenant-1',
      });
      prisma.controlPlane.findFirst.mockResolvedValue(aiDisabledControlPlane);

      await expect(
        service.generateVideoScript('tenant-1', 'user-1', 'deal-1'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'AI_DISABLED' }),
      });

      expect(prisma.jobRun.create).not.toHaveBeenCalled();
      expect(queueService.enqueueMarketing).not.toHaveBeenCalled();
    });

    it('throws when the deal does not belong to the caller', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);

      await expect(
        service.generateVideoScript('tenant-1', 'user-1', 'deal-1'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.controlPlane.findFirst).not.toHaveBeenCalled();
      expect(prisma.jobRun.create).not.toHaveBeenCalled();
      expect(queueService.enqueueMarketing).not.toHaveBeenCalled();
    });
  });
});
