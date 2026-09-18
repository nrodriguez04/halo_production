import { Test, TestingModule } from '@nestjs/testing';
import { ApiCostService } from '../api-cost.service';
import { PrismaService } from '../../prisma.service';

describe('ApiCostService (ledger reads)', () => {
  let service: ApiCostService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      integrationCostEvent: {
        groupBy: jest.fn(),
        aggregate: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiCostService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(ApiCostService);
  });

  it('reports today by provider from completed ledger rows only', async () => {
    prisma.integrationCostEvent.groupBy.mockResolvedValue([
      { providerKey: 'attom', _sum: { actualCostUsd: 0.3 }, _count: { id: 3 } },
      {
        providerKey: 'openai',
        _sum: { actualCostUsd: 0.05 },
        _count: { id: 5 },
      },
    ]);

    const out = await service.getTodaySpend('tenant-1');

    expect(out.total).toBeCloseTo(0.35);
    expect(out.byProvider).toEqual([
      { provider: 'attom', cost: 0.3, calls: 3 },
      { provider: 'openai', cost: 0.05, calls: 5 },
    ]);
    const args = prisma.integrationCostEvent.groupBy.mock.calls[0][0];
    expect(args.by).toEqual(['providerKey']);
    expect(args.where).toEqual(
      expect.objectContaining({ status: 'completed', accountId: 'tenant-1' }),
    );
  });

  it('keeps the endpoint breakdown shape while grouping by ledger action', async () => {
    prisma.integrationCostEvent.groupBy.mockResolvedValue([
      {
        action: 'property_expanded_profile',
        _sum: { actualCostUsd: 1.0 },
        _count: { id: 10 },
        _avg: { actualCostUsd: 0.1, durationMs: 250 },
      },
    ]);

    const out = await service.getEndpointBreakdown('tenant-1', 'attom');

    expect(out).toEqual([
      {
        endpoint: 'property_expanded_profile',
        totalCost: 1.0,
        callCount: 10,
        avgCostPerCall: 0.1,
        avgDurationMs: 250,
      },
    ]);
    expect(prisma.integrationCostEvent.groupBy.mock.calls[0][0].where).toEqual(
      expect.objectContaining({ providerKey: 'attom', status: 'completed' }),
    );
  });

  it('sums the global daily total across accounts', async () => {
    prisma.integrationCostEvent.aggregate.mockResolvedValue({
      _sum: { actualCostUsd: 2.5 },
    });

    expect(await service.getTodayTotal()).toBe(2.5);
    const where = prisma.integrationCostEvent.aggregate.mock.calls[0][0].where;
    expect(where.status).toBe('completed');
    expect(where.accountId).toBeUndefined();
  });

  it('treats a null sum as zero', async () => {
    prisma.integrationCostEvent.aggregate.mockResolvedValue({
      _sum: { actualCostUsd: null },
      _count: { id: 0 },
    });

    const out = await service.getSpendSummary('tenant-1');

    expect(out.today).toEqual({ cost: 0, calls: 0 });
    expect(out.projectedMonthly).toBe(0);
  });
});
