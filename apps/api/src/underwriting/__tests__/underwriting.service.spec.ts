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
        findFirst: jest.fn().mockResolvedValue(null),
      },
      deal: {
        findFirst: jest.fn(),
      },
      underwritingResult: {
        findUnique: jest.fn(),
      },
      aICostLog: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      controlPlane: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnderwritingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: QueueService,
          useValue: { enqueueUnderwriting: jest.fn() },
        },
        {
          provide: TimelineService,
          useValue: { appendEvent: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<UnderwritingService>(UnderwritingService);
  });

  it('returns legacy underwriting results for deals owned by the caller tenant', async () => {
    const legacy = {
      id: 'uw_1',
      dealId: 'deal_1',
      deal: { id: 'deal_1', accountId: 'tenant_1' },
      property: { id: 'property_1' },
    };

    prisma.deal.findFirst.mockResolvedValue({
      id: 'deal_1',
      accountId: 'tenant_1',
    });
    prisma.underwritingResult.findUnique.mockResolvedValue(legacy);

    await expect(service.getResult('tenant_1', 'deal_1')).resolves.toEqual({
      source: 'legacy',
      result: legacy,
    });

    expect(prisma.deal.findFirst).toHaveBeenCalledWith({
      where: { id: 'deal_1', accountId: 'tenant_1' },
    });
  });

  it('throws not found before reading legacy data for a foreign tenant deal', async () => {
    prisma.deal.findFirst.mockResolvedValue(null);

    await expect(service.getResult('tenant_2', 'deal_1')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.deal.findFirst).toHaveBeenCalledWith({
      where: { id: 'deal_1', accountId: 'tenant_2' },
    });
    expect(prisma.underwritingResult.findUnique).not.toHaveBeenCalled();
  });
});
