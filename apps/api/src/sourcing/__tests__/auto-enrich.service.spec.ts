import {
  AutoEnrichService,
  autoEnrichSchedulerEnabled,
  enrichmentPriority,
  rankForEnrichment,
  startOfUtcDay,
} from '../auto-enrich.service';

describe('auto-enrich ranking', () => {
  it('puts distress and listing signals ahead of plain records', () => {
    expect(enrichmentPriority(['tax-lien', 'absentee'])).toBe(5);
    expect(enrichmentPriority(['stale_listing', 'listing:expired'])).toBe(2);
    expect(enrichmentPriority(['owner:occupied'])).toBe(-1);
    expect(enrichmentPriority(['owner:occupied', 'foreclosure'])).toBe(3);
    expect(enrichmentPriority([])).toBe(0);

    const old = new Date('2026-10-01T00:00:00.000Z');
    const recent = new Date('2026-10-12T00:00:00.000Z');
    const ranked = rankForEnrichment([
      { id: 'plain-new', tags: [], createdAt: recent },
      { id: 'distress-old', tags: ['tax:delinquent'], createdAt: old },
      { id: 'plain-old', tags: [], createdAt: old },
      { id: 'occupied', tags: ['owner:occupied'], createdAt: recent },
    ]);
    expect(ranked.map((l) => l.id)).toEqual([
      'distress-old',
      'plain-new',
      'plain-old',
      'occupied',
    ]);
  });

  it('counts the day in UTC and stays off under test', () => {
    expect(
      startOfUtcDay(new Date('2026-10-12T23:59:00-05:00')).toISOString(),
    ).toBe('2026-10-13T00:00:00.000Z');
    expect(autoEnrichSchedulerEnabled()).toBe(false);
  });
});

describe('AutoEnrichService', () => {
  const prisma = {
    lead: { findMany: jest.fn(), count: jest.fn() },
    timelineEvent: { count: jest.fn() },
  };
  const controlPlane = { getStatus: jest.fn() };
  const lifecycle = { transition: jest.fn() };
  const service = () =>
    new AutoEnrichService(prisma as any, controlPlane as any, lifecycle as any);
  const now = new Date('2026-10-12T15:00:00.000Z');
  const cp = (over: Record<string, unknown> = {}) => ({
    enabled: true,
    externalDataEnabled: true,
    autoEnrichEnabled: true,
    autoEnrichDailyCap: 3,
    ...over,
  });
  const lead = (id: string, tags: string[] = [], day = 10) => ({
    id,
    tags,
    createdAt: new Date(`2026-10-${day}T00:00:00.000Z`),
    canonicalAddress: '1 Main St',
    canonicalZip: '78701',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    controlPlane.getStatus.mockResolvedValue(cp());
    prisma.timelineEvent.count.mockResolvedValue(1);
    prisma.lead.count.mockResolvedValue(10);
    lifecycle.transition.mockResolvedValue({});
  });

  it('moves the best new leads to enriching, up to what is left of the daily cap', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead('plain', [], 12),
      lead('distress', ['pre-foreclosure'], 9),
      lead('listing', ['stale_listing'], 11),
      { ...lead('no-zip'), canonicalZip: '  ' },
    ]);

    const res = await service().runForAccount('acct', now);

    expect(prisma.timelineEvent.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'acct',
        eventType: 'lead.status.enriching',
        createdAt: { gte: new Date('2026-10-12T00:00:00.000Z') },
        payloadJson: { path: ['autoEnrich'], equals: true },
      },
    });
    expect(res.leadIds).toEqual(['distress', 'listing']);
    expect(lifecycle.transition).toHaveBeenCalledWith({
      leadId: 'distress',
      accountId: 'acct',
      next: 'enriching',
      actorType: 'system',
      reason: 'Auto-enrich (daily cap 3)',
      metadata: { autoEnrich: true },
    });
    expect(res.status).toMatchObject({
      dailyCap: 3,
      usedToday: 3,
      remainingToday: 0,
      waiting: 8,
    });
  });

  it('does nothing when the cap is used up, the switch is off, or the control plane says no', async () => {
    prisma.timelineEvent.count.mockResolvedValue(3);
    let res = await service().runForAccount('acct', now);
    expect(res.queued).toBe(0);

    prisma.timelineEvent.count.mockResolvedValue(0);
    controlPlane.getStatus.mockResolvedValue(cp({ autoEnrichEnabled: false }));
    res = await service().runForAccount('acct', now);
    expect(res.status.blockedBy).toBe('disabled');

    controlPlane.getStatus.mockResolvedValue(
      cp({ externalDataEnabled: false }),
    );
    res = await service().runForAccount('acct', now);
    expect(res.status.blockedBy).toBe('external_data');

    controlPlane.getStatus.mockResolvedValue(cp({ enabled: false }));
    res = await service().runForAccount('acct', now);
    expect(res.status.blockedBy).toBe('control_plane');

    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(lifecycle.transition).not.toHaveBeenCalled();
  });

  it('skips a lead someone else already moved and keeps going', async () => {
    prisma.lead.findMany.mockResolvedValue([
      lead('a', ['tax-lien']),
      lead('b', ['absentee']),
    ]);
    lifecycle.transition.mockRejectedValueOnce(new Error('Cannot transition'));
    const res = await service().runForAccount('acct', now);
    expect(res.leadIds).toEqual(['b']);
  });

  it('ticks across tenants and ignores the unattributed and global buckets', async () => {
    prisma.lead.findMany
      .mockResolvedValueOnce([
        { accountId: 'acct' },
        { accountId: 'unknown' },
        { accountId: 'GLOBAL' },
      ])
      .mockResolvedValueOnce([lead('a', ['tax-lien'])]);
    await expect(service().tick(now)).resolves.toBe(1);
    expect(controlPlane.getStatus).toHaveBeenCalledTimes(1);
  });
});
