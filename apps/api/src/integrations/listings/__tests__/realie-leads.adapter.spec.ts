import { BadRequestException } from '@nestjs/common';
import { RealieLeadsAdapter, toListing } from '../realie-leads.adapter';
import type { RealieProperty } from '../../realie/realie.types';

const parcel = (
  over: Omit<Partial<RealieProperty>, 'owner'> & {
    owner?: Partial<RealieProperty['owner']>;
  } = {},
): RealieProperty => ({
  realieParcelId: 'RP-1',
  parcelId: '0001',
  address: {
    street: '123 Main St',
    unit: null,
    city: 'Houston',
    state: 'TX',
    postalCode: '77008',
    county: 'Harris',
  },
  latitude: 29.8,
  longitude: -95.4,
  values: { market: 250000, assessed: 210000, estimate: null },
  lastSale: { date: '2019-04-01', price: 180000, distressed: false },
  building: {
    yearBuilt: 1978,
    bedrooms: 3,
    bathrooms: 2,
    livingArea: 1850,
    lotAcres: 0.18,
    useCode: '1110',
    residential: true,
  },
  distress: {
    taxStatus: 'current',
    lienCount: 0,
    foreclosure: false,
    mortgageCount: 1,
  },
  raw: { realieParcelId: 'RP-1' },
  ...over,
  owner: {
    name: 'Jane Owner',
    name2: null,
    occupied: false,
    mailingAddress: '9 Elsewhere Ave',
    mailingCity: 'Austin',
    mailingState: 'TX',
    mailingZip: '78701',
    ...(over.owner ?? {}),
  },
});

describe('RealieLeadsAdapter', () => {
  const ctx = {
    accountId: 'tenant-1',
    actor: 'user' as const,
    userId: 'user-1',
  };
  let realie: { searchProperties: jest.Mock };
  let adapter: RealieLeadsAdapter;

  beforeEach(() => {
    realie = { searchProperties: jest.fn() };
    adapter = new RealieLeadsAdapter(realie as any);
  });

  it('requires a state, which Realie cannot search without', async () => {
    await expect(
      adapter.search({ city: 'Houston' }, ctx),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(realie.searchProperties).not.toHaveBeenCalled();
  });

  it('walks full pages until the limit is met, keeping absentee owners by default', async () => {
    realie.searchProperties
      .mockResolvedValueOnce({
        properties: [
          parcel({ realieParcelId: 'A1' }),
          parcel({ realieParcelId: 'O1', owner: { occupied: true } }),
          parcel({ realieParcelId: 'A2' }),
        ],
        nextCursor: 'c2',
      })
      .mockResolvedValueOnce({
        properties: [
          parcel({ realieParcelId: 'A3' }),
          parcel({ realieParcelId: 'A4' }),
        ],
        nextCursor: 'c3',
      });

    const out = await adapter.search(
      { state: 'tx', city: 'Houston', limit: 3, transferredWithinDays: 180 },
      ctx,
    );

    expect(realie.searchProperties).toHaveBeenCalledTimes(2);
    expect(realie.searchProperties.mock.calls[0][0]).toEqual({
      state: 'tx',
      city: 'Houston',
      zipCode: undefined,
      residential: true,
      transferredWithinDays: 180,
      limit: 100,
      cursor: undefined,
    });
    expect(realie.searchProperties.mock.calls[1][0]).toMatchObject({
      cursor: 'c2',
      limit: 100,
    });
    expect(out.source).toBe('realie');
    expect(out.feed).toBe('public/property/search');
    expect(out.total).toBeNull();
    expect(out.listings.map((l) => l.listingKey)).toEqual(['A1', 'A2', 'A3']);
  });

  it('reads only what it needs when no owner filter applies, and stops when the cursor ends', async () => {
    realie.searchProperties.mockResolvedValueOnce({
      properties: [
        parcel({ realieParcelId: 'A1' }),
        parcel({ realieParcelId: 'O1', owner: { occupied: true } }),
      ],
      nextCursor: null,
    });

    const out = await adapter.search(
      { state: 'TX', postalCode: '77008', status: ['Any'], limit: 5 },
      ctx,
    );

    expect(realie.searchProperties).toHaveBeenCalledTimes(1);
    expect(realie.searchProperties.mock.calls[0][0]).toMatchObject({
      zipCode: '77008',
      limit: 5,
    });
    expect(out.listings).toHaveLength(2);
  });

  it('keeps owner-occupied parcels when asked', async () => {
    realie.searchProperties.mockResolvedValueOnce({
      properties: [
        parcel({ realieParcelId: 'A1' }),
        parcel({ realieParcelId: 'O1', owner: { occupied: true } }),
      ],
      nextCursor: null,
    });
    const out = await adapter.search(
      { state: 'TX', city: 'Houston', status: ['Owner-occupied'] },
      ctx,
    );
    expect(out.listings.map((l) => l.listingKey)).toEqual(['O1']);
  });

  it('never spends more than five tokens on one import', async () => {
    realie.searchProperties.mockResolvedValue({
      properties: [parcel({ realieParcelId: 'O1', owner: { occupied: true } })],
      nextCursor: 'more',
    });
    const out = await adapter.search({ state: 'TX', city: 'Houston' }, ctx);
    expect(realie.searchProperties).toHaveBeenCalledTimes(5);
    expect(out.listings).toEqual([]);
  });

  it('maps a parcel to a lead with the owner, signal tags and a summary', () => {
    const l = toListing(
      parcel({
        address: {
          street: '123 Main St',
          unit: '4B',
          city: 'Houston',
          state: 'TX',
          postalCode: '77008',
          county: 'Harris',
        },
        distress: {
          taxStatus: 'delinquent',
          lienCount: 2,
          foreclosure: true,
          mortgageCount: 1,
        },
        lastSale: { date: '2019-04-01', price: 180000, distressed: true },
      }),
      { state: 'TX', transferredWithinDays: 365 },
    );

    expect(l).toMatchObject({
      listingKey: 'RP-1',
      mlsId: null,
      status: 'Absentee',
      listPrice: null,
      address: {
        street: '123 Main St 4B',
        city: 'Houston',
        state: 'TX',
        postalCode: '77008',
      },
      propertyType: '1110',
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1850,
      yearBuilt: 1978,
      daysOnMarket: null,
      listingAgent: null,
      ownerName: 'Jane Owner',
      signals: [
        'owner:absentee',
        'tax:delinquent',
        'foreclosure',
        'lien',
        'distressed_sale',
        'recent_transfer',
      ],
    });
    expect(l.summary).toBe(
      'absentee owner · tax delinquent · foreclosure on file · 2 lien(s) · market value $250,000 · last sale 2019-04-01 $180,000 · built 1978',
    );
    expect(l.raw).toEqual({ realieParcelId: 'RP-1' });
  });

  it('labels a parcel whose occupancy Realie does not state as a plain county record', () => {
    const l = toListing(parcel({ owner: { occupied: null } }), { state: 'TX' });
    expect(l.status).toBe('Public record');
    expect(l.signals).toEqual([]);
    expect(l.summary?.startsWith('county record')).toBe(true);
  });
});
