import { IntegrationUnavailableException } from '../../integrations/integration-unavailable.exception';
import { nextRunAt, SourcingService, toCriteria } from '../sourcing.service';

const market = (over: Record<string, unknown> = {}) => ({
  id: 'm-1',
  accountId: 'tenant-1',
  label: 'Houston, TX',
  state: 'TX',
  city: 'Houston',
  postalCode: null,
  sources: ['rentcast', 'realie'],
  criteria: { status: ['Absentee'], limit: 25 },
  cadence: 'daily',
  enabled: true,
  nextRunAt: new Date('2026-10-12T06:00:00Z'),
  lastRunAt: null,
  lastResult: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  updatedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
});

describe('SourcingService', () => {
  let prisma: any;
  let listingImport: { importListings: jest.Mock };
  let automation: {
    createRun: jest.Mock;
    startRun: jest.Mock;
    completeRun: jest.Mock;
    failRun: jest.Mock;
  };
  let controlPlane: { isEnabled: jest.Mock };
  let service: SourcingService;

  beforeEach(() => {
    delete process.env.SOURCING_RUN_HOUR_UTC;
    prisma = {
      sourcingMarket: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(market()),
        create: jest.fn(async ({ data }: any) => ({ id: 'm-new', ...data })),
        update: jest.fn(async ({ data }: any) => ({ ...market(), ...data })),
        delete: jest.fn(),
      },
      automationRun: { findMany: jest.fn().mockResolvedValue([]) },
    };
    listingImport = {
      importListings: jest.fn(async (source: string) => ({
        source,
        feed: source,
        searched: 10,
        total: 10,
        created: source === 'rentcast' ? 4 : 2,
        duplicates: source === 'rentcast' ? 6 : 8,
        errors: [],
      })),
    };
    automation = {
      createRun: jest.fn().mockResolvedValue({ id: 'run-1' }),
      startRun: jest.fn(),
      completeRun: jest.fn(),
      failRun: jest.fn(),
    };
    controlPlane = { isEnabled: jest.fn().mockResolvedValue(true) };
    service = new SourcingService(
      prisma,
      listingImport as any,
      automation as any,
      controlPlane as any,
    );
  });

  describe('nextRunAt', () => {
    it('schedules daily markets for the next 06:00 UTC and weekly ones for Monday', () => {
      const before = new Date('2026-10-14T03:00:00Z'); // Wednesday
      const after = new Date('2026-10-14T09:00:00Z');
      expect(nextRunAt('daily', before)?.toISOString()).toBe(
        '2026-10-14T06:00:00.000Z',
      );
      expect(nextRunAt('daily', after)?.toISOString()).toBe(
        '2026-10-15T06:00:00.000Z',
      );
      expect(nextRunAt('weekly', after)?.toISOString()).toBe(
        '2026-10-19T06:00:00.000Z',
      );
      expect(nextRunAt('manual', after)).toBeNull();
    });

    it('honours SOURCING_RUN_HOUR_UTC', () => {
      process.env.SOURCING_RUN_HOUR_UTC = '11';
      expect(
        nextRunAt('daily', new Date('2026-10-14T03:00:00Z'))?.toISOString(),
      ).toBe('2026-10-14T11:00:00.000Z');
    });
  });

  it('creates a market with a default label, an upper-cased state and a first run time', async () => {
    const created = await service.create('tenant-1', {
      state: 'tx',
      city: 'Houston',
      sources: ['rentcast', 'rentcast', 'realie'],
      criteria: { status: ['Active'] },
    });

    expect(prisma.sourcingMarket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountId: 'tenant-1',
        label: 'Houston, TX',
        state: 'TX',
        city: 'Houston',
        postalCode: null,
        sources: ['rentcast', 'realie'],
        criteria: { status: ['Active'] },
        cadence: 'daily',
        enabled: true,
        nextRunAt: expect.any(Date),
      }),
    });
    expect(created.id).toBe('m-new');
  });

  it('adds the top metros that are not already set up', async () => {
    prisma.sourcingMarket.findMany.mockResolvedValueOnce([
      market({ label: 'Houston, TX' }),
    ]);

    const out = await service.createMetros('tenant-1', {
      count: 5,
      sources: ['realie'],
      cadence: 'weekly',
    });

    expect(out.created.map((m) => m.label)).toEqual([
      'New York, NY',
      'Los Angeles, CA',
      'Chicago, IL',
      'Phoenix, AZ',
    ]);
    expect(out.skipped).toEqual(['Houston, TX']);
    expect(prisma.sourcingMarket.create.mock.calls[0][0].data).toMatchObject({
      state: 'NY',
      city: 'New York',
      sources: ['realie'],
      cadence: 'weekly',
    });
  });

  it('maps a market to the import criteria the sources understand', () => {
    expect(toCriteria(market() as any)).toEqual({
      state: 'TX',
      city: 'Houston',
      postalCode: undefined,
      status: ['Absentee'],
      minPrice: undefined,
      maxPrice: undefined,
      minDaysOnMarket: undefined,
      transferredWithinDays: undefined,
      propertyType: undefined,
      limit: 25,
    });
    expect(toCriteria(market({ criteria: null }) as any).limit).toBe(50);
  });

  it('pulls every source, records the outcome, schedules the next run and books an automation run', async () => {
    const result = await service.runMarket(market() as any, 'SCHEDULED');

    expect(listingImport.importListings).toHaveBeenCalledTimes(2);
    expect(listingImport.importListings).toHaveBeenCalledWith(
      'rentcast',
      expect.objectContaining({
        state: 'TX',
        city: 'Houston',
        status: ['Absentee'],
        limit: 25,
      }),
      'tenant-1',
      'system',
    );
    expect(result).toMatchObject({
      marketId: 'm-1',
      trigger: 'SCHEDULED',
      created: 6,
      outcomes: [
        { source: 'rentcast', ok: true, created: 4, duplicates: 6 },
        { source: 'realie', ok: true, created: 2, duplicates: 8 },
      ],
    });
    expect(prisma.sourcingMarket.update).toHaveBeenCalledWith({
      where: { id: 'm-1' },
      data: expect.objectContaining({
        lastRunAt: expect.any(Date),
        lastResult: expect.objectContaining({ created: 6 }),
        nextRunAt: expect.any(Date),
      }),
    });
    expect(automation.createRun).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-1',
        source: 'sourcing',
        workflowName: 'market_pull',
        entityType: 'sourcing_market',
        entityId: 'm-1',
        triggerType: 'SCHEDULED',
      }),
    );
    expect(automation.startRun).toHaveBeenCalledWith('run-1', 'tenant-1');
    expect(automation.completeRun).toHaveBeenCalledWith('run-1', 'tenant-1', {
      outputJson: expect.objectContaining({ created: 6 }),
    });
    expect(automation.failRun).not.toHaveBeenCalled();
  });

  it('keeps going when one source is unavailable and fails the run only when all of them are', async () => {
    listingImport.importListings.mockImplementation(async (source: string) => {
      if (source === 'rentcast') {
        throw IntegrationUnavailableException.notConfigured(
          'rentcast',
          'RENTCAST_API_KEY',
        );
      }
      return {
        source,
        feed: source,
        searched: 3,
        total: 3,
        created: 1,
        duplicates: 2,
        errors: [],
      };
    });

    const partial = await service.runMarket(market() as any, 'UI', 'user-1');
    expect(partial.outcomes).toEqual([
      {
        source: 'rentcast',
        ok: false,
        error: expect.stringContaining('RENTCAST_API_KEY'),
      },
      { source: 'realie', ok: true, searched: 3, created: 1, duplicates: 2 },
    ]);
    expect(automation.completeRun).toHaveBeenCalled();

    listingImport.importListings.mockRejectedValue(new Error('vendor down'));
    const failed = await service.runMarket(market() as any, 'UI', 'user-1');
    expect(failed.created).toBe(0);
    expect(automation.failRun).toHaveBeenCalledWith('run-1', 'tenant-1', {
      outcomes: failed.outcomes,
    });
  });

  it('does not pull anything while the control plane is disabled, but still reschedules', async () => {
    controlPlane.isEnabled.mockResolvedValueOnce(false);

    const result = await service.runMarket(market() as any, 'SCHEDULED');

    expect(result.skipped).toBe('control plane disabled');
    expect(listingImport.importListings).not.toHaveBeenCalled();
    expect(automation.createRun).not.toHaveBeenCalled();
    expect(prisma.sourcingMarket.update).toHaveBeenCalled();
  });

  it('recomputes the schedule when cadence or enabled changes, and clears it when disabled', async () => {
    await service.update('tenant-1', 'm-1', { enabled: false });
    expect(prisma.sourcingMarket.update.mock.calls[0][0].data).toMatchObject({
      enabled: false,
      nextRunAt: null,
    });

    await service.update('tenant-1', 'm-1', { cadence: 'weekly' });
    expect(prisma.sourcingMarket.update.mock.calls[1][0].data).toMatchObject({
      cadence: 'weekly',
      nextRunAt: expect.any(Date),
    });

    await service.update('tenant-1', 'm-1', { label: 'Houston metro' });
    expect(
      prisma.sourcingMarket.update.mock.calls[2][0].data,
    ).not.toHaveProperty('nextRunAt');
  });

  it('refuses to touch a market from another tenant', async () => {
    prisma.sourcingMarket.findFirst.mockResolvedValueOnce(null);
    await expect(service.remove('tenant-2', 'm-1')).rejects.toThrow(
      'Market not found',
    );
    expect(prisma.sourcingMarket.delete).not.toHaveBeenCalled();
  });
});
