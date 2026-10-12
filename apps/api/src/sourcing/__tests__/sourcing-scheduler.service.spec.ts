import {
  schedulerEnabled,
  SourcingSchedulerService,
} from '../sourcing-scheduler.service';

describe('SourcingSchedulerService', () => {
  const env = { ...process.env };
  const due = (id: string) => ({
    id,
    cadence: 'daily',
    enabled: true,
    nextRunAt: new Date('2026-10-12T06:00:00Z'),
  });
  let prisma: any;
  let sourcing: { runMarket: jest.Mock };
  let scheduler: SourcingSchedulerService;

  beforeEach(() => {
    prisma = {
      sourcingMarket: {
        findMany: jest.fn().mockResolvedValue([due('a'), due('b')]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    sourcing = { runMarket: jest.fn().mockResolvedValue({ created: 1 }) };
    scheduler = new SourcingSchedulerService(prisma, sourcing as any);
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('claims each due market by moving nextRunAt forward, then runs it as SCHEDULED', async () => {
    const now = new Date('2026-10-12T06:05:00Z');

    const ran = await scheduler.tick(now);

    expect(prisma.sourcingMarket.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { enabled: true, nextRunAt: { lte: now } },
      }),
    );
    expect(prisma.sourcingMarket.updateMany).toHaveBeenCalledWith({
      where: { id: 'a', nextRunAt: new Date('2026-10-12T06:00:00Z') },
      data: { nextRunAt: new Date('2026-10-13T06:00:00Z') },
    });
    expect(sourcing.runMarket).toHaveBeenCalledTimes(2);
    expect(sourcing.runMarket).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a' }),
      'SCHEDULED',
    );
    expect(ran).toBe(2);
  });

  it('skips a market another replica claimed first and survives a failing run', async () => {
    prisma.sourcingMarket.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    sourcing.runMarket.mockRejectedValueOnce(new Error('boom'));

    const ran = await scheduler.tick(new Date('2026-10-12T06:05:00Z'));

    expect(sourcing.runMarket).toHaveBeenCalledTimes(1);
    expect(sourcing.runMarket).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'b' }),
      'SCHEDULED',
    );
    expect(ran).toBe(0);
  });

  it('does not overlap ticks', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    sourcing.runMarket.mockImplementationOnce(() => gate);
    const first = scheduler.tick(new Date('2026-10-12T06:05:00Z'));
    const second = await scheduler.tick(new Date('2026-10-12T06:05:01Z'));
    expect(second).toBe(0);
    release();
    await first;
    expect(prisma.sourcingMarket.findMany).toHaveBeenCalledTimes(1);
  });

  it('is off under test and when SOURCING_SCHEDULER=off', () => {
    expect(schedulerEnabled()).toBe(false); // NODE_ENV=test here
    process.env.NODE_ENV = 'development';
    expect(schedulerEnabled()).toBe(true);
    process.env.SOURCING_SCHEDULER = 'off';
    expect(schedulerEnabled()).toBe(false);
  });
});
