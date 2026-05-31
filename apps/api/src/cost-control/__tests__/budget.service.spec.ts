import { BudgetService } from '../budget.service';

describe('BudgetService', () => {
  let prisma: any;
  let service: BudgetService;

  const makeBucket = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'bucket-1',
    accountId: 'acc_1',
    scope: 'provider',
    scopeRef: 'attom',
    period: 'month',
    hardCapUsd: 150,
    softCapUsd: 120,
    currentSpendUsd: 149.95,
    enabled: true,
    notes: null,
    periodStartedAt: new Date(2026, 3, 1, 0, 0, 0, 0),
    periodResetsAt: new Date(2026, 4, 1, 0, 0, 0, 0),
    updatedAt: new Date(2026, 3, 15, 12, 0, 0, 0),
    ...overrides,
  });

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 31, 12, 0, 0, 0));

    prisma = {
      integrationBudgetBucket: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
    };

    service = new BudgetService(prisma);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rolls expired buckets into the current period before returning them', async () => {
    const expired = makeBucket();
    prisma.integrationBudgetBucket.findMany.mockResolvedValue([expired]);
    prisma.integrationBudgetBucket.updateMany.mockResolvedValue({ count: 1 });

    const buckets = await service.findApplicable({
      provider: 'attom',
      action: 'property_expanded_profile',
      payload: {},
      context: { accountId: 'acc_1', actor: 'system' },
    } as any);

    expect(prisma.integrationBudgetBucket.updateMany).toHaveBeenCalledWith({
      where: {
        id: expired.id,
        periodResetsAt: expired.periodResetsAt,
      },
      data: {
        periodStartedAt: new Date(2026, 4, 1, 0, 0, 0, 0),
        periodResetsAt: new Date(2026, 5, 1, 0, 0, 0, 0),
        currentSpendUsd: 0,
      },
    });
    expect(buckets).toEqual([
      expect.objectContaining({
        id: expired.id,
        currentSpendUsd: 0,
        period: 'month',
      }),
    ]);
  });

  it('reloads the bucket when another request already refreshed the period', async () => {
    const expired = makeBucket();
    const refreshed = makeBucket({
      currentSpendUsd: 0.25,
      periodStartedAt: new Date(2026, 4, 1, 0, 0, 0, 0),
      periodResetsAt: new Date(2026, 5, 1, 0, 0, 0, 0),
    });

    prisma.integrationBudgetBucket.findMany.mockResolvedValue([expired]);
    prisma.integrationBudgetBucket.updateMany.mockResolvedValue({ count: 0 });
    prisma.integrationBudgetBucket.findUniqueOrThrow.mockResolvedValue(refreshed);

    const buckets = await service.findApplicable({
      provider: 'attom',
      action: 'property_expanded_profile',
      payload: {},
      context: { accountId: 'acc_1', actor: 'system' },
    } as any);

    expect(prisma.integrationBudgetBucket.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: expired.id },
    });
    expect(buckets).toEqual([
      expect.objectContaining({
        id: refreshed.id,
        currentSpendUsd: 0.25,
      }),
    ]);
  });

  it('treats projected spend as over the hard cap', () => {
    const bucket = {
      id: 'bucket-1',
      scope: 'provider',
      scopeRef: 'attom',
      period: 'month',
      hardCapUsd: 150,
      softCapUsd: null,
      currentSpendUsd: 149.95,
      enabled: true,
    };

    expect(service.findOverHardCap([bucket], 0.1)).toEqual(bucket);
    expect(service.findOverHardCap([bucket], 0.01)).toBeNull();
  });
});
