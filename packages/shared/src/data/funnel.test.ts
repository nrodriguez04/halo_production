import { funnelBy, funnelRow, leadSource, type FunnelLead } from './funnel';

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
});
