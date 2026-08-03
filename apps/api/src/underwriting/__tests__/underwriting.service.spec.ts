import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { QueueService } from '../../queues/queue.service';
import { TimelineService } from '../../timeline/timeline.service';
import { UnderwritingService } from '../underwriting.service';

describe('UnderwritingService', () => {
  let service: UnderwritingService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      jobRun: {
        findMany: jest.fn(),
        create: jest.fn(),
      },
      underwritingResult: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnderwritingService,
        { provide: PrismaService, useValue: prisma },
        { provide: QueueService, useValue: { enqueueUnderwriting: jest.fn() } },
        { provide: TimelineService, useValue: { appendEvent: jest.fn() } },
      ],
    }).compile();

    service = module.get<UnderwritingService>(UnderwritingService);
  });

  describe('getResult', () => {
    it('skips newer unapplied job-run payloads and returns the latest applied result', async () => {
      prisma.jobRun.findMany.mockResolvedValue([
        {
          id: 'job-stale',
          resultJson: {
            arv: 200000,
            repairEstimate: 30000,
            mao: 110000,
            applied: false,
            staleReason: 'deal_modified_after_enqueue',
          },
        },
        {
          id: 'job-applied',
          resultJson: {
            arv: 260000,
            repairEstimate: 35000,
            mao: 145000,
          },
        },
      ]);

      await expect(service.getResult('tenant-1', 'deal-1')).resolves.toEqual({
        source: 'job_run',
        jobId: 'job-applied',
        result: {
          arv: 260000,
          repairEstimate: 35000,
          mao: 145000,
        },
      });
      expect(prisma.underwritingResult.findUnique).not.toHaveBeenCalled();
    });

    it('falls back to the legacy underwriting row when no applied job-run result exists', async () => {
      const legacy = {
        id: 'uw-1',
        dealId: 'deal-1',
        arv: 255000,
        repairEstimate: 32000,
        mao: 143000,
      };
      prisma.jobRun.findMany.mockResolvedValue([
        {
          id: 'job-stale',
          resultJson: {
            arv: 200000,
            applied: false,
            staleReason: 'deal_modified_after_enqueue',
          },
        },
      ]);
      prisma.underwritingResult.findUnique.mockResolvedValue(legacy);

      await expect(service.getResult('tenant-1', 'deal-1')).resolves.toEqual({
        source: 'legacy',
        result: legacy,
      });
    });

    it('throws when no applied or legacy result exists', async () => {
      prisma.jobRun.findMany.mockResolvedValue([]);
      prisma.underwritingResult.findUnique.mockResolvedValue(null);

      await expect(service.getResult('tenant-1', 'deal-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
