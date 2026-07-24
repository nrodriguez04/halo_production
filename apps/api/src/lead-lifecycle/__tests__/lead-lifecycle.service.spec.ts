import { Test, TestingModule } from '@nestjs/testing';
import { LeadLifecycleService } from '../lead-lifecycle.service';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { QueueService } from '../../queues/queue.service';

describe('LeadLifecycleService', () => {
  let service: LeadLifecycleService;
  let prisma: any;
  let timeline: any;
  let queueService: any;

  beforeEach(async () => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
      },
      leadEnrichmentJob: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    timeline = {
      appendEvent: jest.fn().mockResolvedValue({ id: 'evt-1' }),
    };

    queueService = {
      enqueueLeadEnrichment: jest.fn().mockResolvedValue({ id: 'queue-job-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LeadLifecycleService,
        { provide: PrismaService, useValue: prisma },
        { provide: TimelineService, useValue: timeline },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get<LeadLifecycleService>(LeadLifecycleService);
  });

  it('enqueues lead enrichment when a lead first enters enriching', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', status: 'new' });
    prisma.lead.update.mockResolvedValue({ id: 'lead-1', status: 'enriching' });
    prisma.leadEnrichmentJob.findFirst.mockResolvedValue(null);
    prisma.leadEnrichmentJob.create.mockResolvedValue({ id: 'job-1' });
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', status: 'enriching' });

    await service.transition({
      leadId: 'lead-1',
      accountId: 'acct-1',
      next: 'enriching',
      actorId: 'user-1',
      actorType: 'user',
    });

    expect(queueService.enqueueLeadEnrichment).toHaveBeenCalledWith('lead-1');
  });

  it('does not enqueue duplicate enrichment work for enriching no-op transitions', async () => {
    prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1', status: 'enriching' });
    prisma.lead.update.mockResolvedValue({ id: 'lead-1', status: 'enriching' });
    prisma.leadEnrichmentJob.findFirst.mockResolvedValue({ id: 'job-1' });
    prisma.leadEnrichmentJob.update.mockResolvedValue({ id: 'job-1' });
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1', status: 'enriching' });

    await service.transition({
      leadId: 'lead-1',
      accountId: 'acct-1',
      next: 'enriching',
      actorId: 'user-1',
      actorType: 'user',
    });

    expect(queueService.enqueueLeadEnrichment).not.toHaveBeenCalled();
  });
});
