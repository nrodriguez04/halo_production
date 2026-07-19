import { Test, TestingModule } from '@nestjs/testing';
import { UnderwritingService } from '../underwriting.service';
import { PrismaService } from '../../prisma.service';
import { QueueService } from '../../queues/queue.service';
import { TimelineService } from '../../timeline/timeline.service';

describe('UnderwritingService', () => {
  let service: UnderwritingService;
  let prisma: any;
  let queueService: any;
  let timelineService: any;

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
    };

    queueService = {
      enqueueUnderwriting: jest.fn(),
    };

    timelineService = {
      appendEvent: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnderwritingService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: queueService },
        { provide: TimelineService, useValue: timelineService },
      ],
    }).compile();

    service = module.get<UnderwritingService>(UnderwritingService);
  });

  it('rejects when AI is disabled even if external data remains enabled', async () => {
    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal-1',
      accountId: 'tenant-1',
    });
    prisma.controlPlane.findFirst.mockResolvedValue({
      enabled: true,
      smsEnabled: true,
      emailEnabled: true,
      docusignEnabled: true,
      externalDataEnabled: true,
      aiEnabled: false,
    });

    await expect(
      service.analyze('tenant-1', 'user-1', 'deal-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'AI_DISABLED' }),
    });

    expect(prisma.jobRun.create).not.toHaveBeenCalled();
    expect(queueService.enqueueUnderwriting).not.toHaveBeenCalled();
    expect(timelineService.appendEvent).not.toHaveBeenCalled();
  });
});
