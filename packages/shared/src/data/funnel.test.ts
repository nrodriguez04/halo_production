import {
  SpendInputSchema,
  allocateSpend,
  funnelBy,
  funnelRow,
  leadSource,
  sourceKey,
  type FunnelLead,
} from './funnel';

/** A SYNTHETIC lead that got nowhere, with overrides. */
function lead(over: Partial<FunnelLead> = {}): FunnelLead {
  return {
    source: 'county_csv',
    state: 'TX',
    reachable: false,
    contacted: false,
    conversation: false,
    offer: false,
    contract: false,
    assignment: false,
    closed: false,
    fee: 0,
    costUsd: 0.5,
    ...over,
  };
}

describe('conversion funnel', () => {
  it('counts each lead at every stage up to the furthest it reached', () => {
    const row = funnelRow('all', [
      lead(),
      lead({ reachable: true }),
      lead({ reachable: true, contacted: true }),
      lead({ reachable: true, contacted: true, conversation: true, offer: true }),
      // Signed without a recorded conversation: still counts as offered and talked to.
      lead({ contract: true, assignment: true, closed: true, fee: 12_000 }),
    ]);
    expect(row.counts).toEqual({
      leads: 5,
      reachable: 4,
      contacted: 3,
      conversations: 2,
      offers: 2,
      contracts: 1,
      assignments: 1,
      closed: 1,
    });
    expect(row.rates.reachable).toBe(0.8);
    expect(row.rates.contracts).toBe(0.5);
    expect(row.leadToClose).toBe(0.2);
    expect(row).toMatchObject({
      realizedFees: 12_000,
      costUsd: 2.5,
      costPerLead: 0.5,
      costPerContract: 2.5,
      costPerClose: 2.5,
      feesPerLead: 2400,
      returnOnCost: 4800,
    });
  });

  it('measures closing against contracts, since a double close has no assignment', () => {
    const row = funnelRow('all', [
      lead({ contract: true, closed: true, fee: 8000 }),
      lead({ contract: true, assignment: true, closed: true, fee: 10_000 }),
    ]);
    expect(row.counts.assignments).toBe(1);
    expect(row.rates.closed).toBe(1);
    expect(row.rates.assignments).toBe(0.5);
  });

  it('leaves rates and unit costs empty instead of dividing by zero', () => {
    const row = funnelRow('none', [lead({ costUsd: 0 })]);
    expect(row.rates.contacted).toBeNull();
    expect(row.costPerContract).toBeNull();
    expect(row.returnOnCost).toBeNull();
  });

  it('groups by a dimension, best realized fees first', () => {
    const rows = funnelBy(
      [
        lead({ source: 'mls_expired' }),
        lead({ source: 'county_csv', contract: true, closed: true, fee: 9000 }),
        lead({ source: 'county_csv' }),
      ],
      (l) => l.source,
    );
    expect(rows.map((r) => [r.key, r.counts.leads, r.realizedFees])).toEqual([
      ['county_csv', 2, 9000],
      ['mls_expired', 1, 0],
    ]);
  });

  it("reads a lead's source from its tags", () => {
    expect(leadSource(['stale_listing', 'source:mls_expired'])).toBe('mls_expired');
    expect(leadSource(['vacant'])).toBe('unattributed');
  });

  it('adds entered spend to the cost every unit figure divides', () => {
    const row = funnelRow(
      'direct_mail',
      [lead({ contract: true, closed: true, fee: 10_000 }), lead()],
      999,
    );
    expect(row).toMatchObject({
      providerCostUsd: 1,
      spendUsd: 999,
      costUsd: 1000,
      costPerLead: 500,
      costPerContract: 1000,
      returnOnCost: 10,
    });
  });

  it('gives spend that produced no leads a row of its own', () => {
    const spend = allocateSpend([
      { source: 'direct_mail', state: 'TX', amountUsd: 1200 },
      { source: 'county_csv', state: null, amountUsd: 300 },
      { source: null, state: 'AZ', amountUsd: 50.25 },
    ]);
    expect(spend.total).toBe(1550.25);
    expect(spend.withoutSource).toBe(50.25);
    expect(spend.withoutState).toBe(300);
    expect(spend.byState.get('TX')).toBe(1200);
    const rows = funnelBy([lead({ source: 'county_csv' })], (l) => l.source, spend.bySource);
    expect(rows.map((r) => [r.key, r.counts.leads, r.costUsd])).toEqual([
      ['county_csv', 1, 300.5],
      ['direct_mail', 0, 1200],
    ]);
    expect(rows[1].costPerLead).toBeNull();
    expect(rows[1].returnOnCost).toBe(0);
  });

  it('checks entered spend and spells its source the way lead tags do', () => {
    expect(
      SpendInputSchema.parse({
        spentOn: '2026-10-20',
        category: 'direct_mail',
        amountUsd: 1234.567,
        source: ' Direct Mail Q4 ',
        state: 'tx',
        vendor: '',
      }),
    ).toEqual({
      spentOn: '2026-10-20',
      category: 'direct_mail',
      amountUsd: 1234.57,
      source: 'direct_mail_q4',
      state: 'TX',
      vendor: null,
      note: null,
    });
    expect(sourceKey('MLS / expired')).toBe('mls_expired');
    const bad = (over: Record<string, unknown>) =>
      SpendInputSchema.safeParse({ spentOn: '2026-10-20', category: 'ads', amountUsd: 10, ...over }).success;
    expect(bad({ amountUsd: 0 })).toBe(false);
    expect(bad({ amountUsd: -5 })).toBe(false);
    expect(bad({ category: 'bribes' })).toBe(false);
    expect(bad({ state: 'Texas' })).toBe(false);
    expect(bad({ spentOn: '10/20/2026' })).toBe(false);
    expect(bad({ accountId: 'someone-else' })).toBe(false);
    expect(bad({ state: '' })).toBe(true);
  });
});
