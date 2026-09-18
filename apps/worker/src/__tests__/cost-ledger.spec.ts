const mockPrisma = {
  integrationProvider: { findUnique: jest.fn().mockResolvedValue({ id: 'p_attom' }) },
  integrationBudgetBucket: {
    findMany: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    findUnique: jest.fn(),
  },
  integrationCostEvent: { create: jest.fn().mockResolvedValue({}) },
};
jest.mock('../prisma-client', () => ({ prisma: mockPrisma }));

import { isOverHardCap, recordWorkerCost } from '../cost-ledger';

const DAY = 24 * 60 * 60 * 1000;
const bucket = (over: Partial<Record<string, unknown>>) => ({
  id: 'b_1',
  accountId: 'tenant-1',
  scope: 'provider',
  scopeRef: 'attom',
  period: 'day',
  enabled: true,
  hardCapUsd: 10,
  softCapUsd: 8,
  currentSpendUsd: 10, // at the cap
  periodStartedAt: new Date(Date.now() - 2 * DAY),
  periodResetsAt: new Date(Date.now() + DAY), // current period by default
  ...over,
});

const resetWrites = () =>
  mockPrisma.integrationBudgetBucket.updateMany.mock.calls
    .map(([args]) => args)
    .filter((a) => a.data && 'periodResetsAt' in a.data);

describe('worker cost ledger period rollover', () => {
  beforeEach(() => jest.clearAllMocks());

  it('still blocks on a capped bucket inside its period', async () => {
    mockPrisma.integrationBudgetBucket.findMany.mockResolvedValue([bucket({})]);
    expect(await isOverHardCap('tenant-1', 'attom')).toBe(true);
    expect(resetWrites()).toHaveLength(0);
  });

  it('does not block on a capped bucket whose period has expired, and rolls it forward', async () => {
    const expiredAt = new Date(Date.now() - DAY);
    mockPrisma.integrationBudgetBucket.findMany.mockResolvedValue([
      bucket({ periodResetsAt: expiredAt }),
    ]);

    expect(await isOverHardCap('tenant-1', 'attom')).toBe(false);

    const [write] = resetWrites();
    expect(write.where).toEqual({ id: 'b_1', periodResetsAt: expiredAt });
    expect(write.data.currentSpendUsd).toBe(0);
    expect(write.data.periodResetsAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('re-reads the row instead of zeroing it when the api already rolled it over', async () => {
    const expiredAt = new Date(Date.now() - DAY);
    mockPrisma.integrationBudgetBucket.findMany.mockResolvedValue([
      bucket({ periodResetsAt: expiredAt }),
    ]);
    mockPrisma.integrationBudgetBucket.updateMany.mockResolvedValueOnce({ count: 0 });
    // The api rolled it and has already debited the new period past the cap.
    mockPrisma.integrationBudgetBucket.findUnique.mockResolvedValue(
      bucket({ currentSpendUsd: 12, periodResetsAt: new Date(Date.now() + DAY) }),
    );

    expect(await isOverHardCap('tenant-1', 'attom')).toBe(true);
    expect(mockPrisma.integrationBudgetBucket.findUnique).toHaveBeenCalledWith({ where: { id: 'b_1' } });
  });

  it('records worker spend against the rolled-over bucket', async () => {
    const expiredAt = new Date(Date.now() - DAY);
    mockPrisma.integrationBudgetBucket.findMany.mockResolvedValue([
      bucket({ periodResetsAt: expiredAt }),
    ]);

    await recordWorkerCost({
      accountId: 'tenant-1',
      providerKey: 'attom',
      action: 'property_lookup',
      costUsd: 0.25,
      status: 'success',
    } as any);

    expect(resetWrites()).toHaveLength(1);
    const increments = mockPrisma.integrationBudgetBucket.updateMany.mock.calls
      .map(([args]) => args)
      .filter((a) => a.data?.currentSpendUsd?.increment !== undefined);
    expect(increments).toEqual([
      { where: { id: { in: ['b_1'] } }, data: { currentSpendUsd: { increment: 0.25 } } },
    ]);
    expect(mockPrisma.integrationCostEvent.create).toHaveBeenCalledTimes(1);
  });
});
