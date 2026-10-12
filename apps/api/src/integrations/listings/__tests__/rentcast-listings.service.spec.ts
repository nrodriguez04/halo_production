import {
  RentCastListingsService,
  applyLocalFilters,
  normalizeRentCastListing,
} from '../rentcast-listings.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

/** One listing as GET /listings/sale returns it (developers.rentcast.io). */
const rentcastListing = {
  id: '5500-Grand-Lake-Dr,-San-Antonio,-TX-78244',
  formattedAddress: '5500 Grand Lake Dr, San Antonio, TX 78244',
  addressLine1: '5500 Grand Lake Dr',
  addressLine2: null,
  city: 'San Antonio',
  state: 'TX',
  zipCode: '78244',
  county: 'Bexar',
  latitude: 29.47,
  longitude: -98.35,
  propertyType: 'Single Family',
  bedrooms: 3,
  bathrooms: 2,
  squareFootage: 1878,
  lotSize: 8843,
  yearBuilt: 1973,
  status: 'Active',
  price: 229900,
  listingType: 'Standard',
  listedDate: '2026-06-01T00:00:00.000Z',
  removedDate: null,
  createdDate: '2026-06-01T00:00:00.000Z',
  lastSeenDate: '2026-10-10T00:00:00.000Z',
  daysOnMarket: 132,
  mlsName: 'SABOR',
  mlsNumber: '1812345',
  listingAgent: {
    name: 'Alex Agent',
    phone: '2105550100',
    email: 'alex@example.com',
    website: 'https://example.com',
  },
  listingOffice: {
    name: 'Example Realty',
    phone: '2105550199',
    email: 'office@example.com',
  },
};

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

describe('RentCastListingsService', () => {
  const ctx = {
    accountId: 'tenant-1',
    actor: 'user' as const,
    userId: 'user-1',
  };
  let controlPlane: { isExternalDataEnabled: jest.Mock };
  let costControl: { checkAndCall: jest.Mock };
  let secrets: { resolve: jest.Mock };
  let fetchSpy: jest.SpyInstance;
  let service: RentCastListingsService;

  beforeEach(() => {
    controlPlane = { isExternalDataEnabled: jest.fn().mockResolvedValue(true) };
    costControl = {
      checkAndCall: jest.fn(async (intent: any) => ({
        decision: { kind: 'ALLOW' },
        result: await intent.execute(),
      })),
    };
    secrets = {
      resolve: jest.fn(async (_provider: string, key: string) =>
        key === 'RENTCAST_API_KEY' ? 'rc-key' : null,
      ),
    };
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async () =>
        json([rentcastListing], 200, { 'X-Total-Count': '7' }),
      );
    service = new RentCastListingsService(
      controlPlane as any,
      costControl as any,
      secrets as any,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('buildUrl', () => {
    it('speaks the RentCast query vocabulary, with min:max ranges and * for an open end', () => {
      const url = new URL(
        RentCastListingsService.buildUrl({
          city: 'Houston',
          state: 'tx',
          status: ['Active'],
          minPrice: 100000,
          propertyType: 'Single Family',
          minDaysOnMarket: 90,
          limit: 25,
          offset: 50,
        }),
      );
      expect(url.origin + url.pathname).toBe(
        'https://api.rentcast.io/v1/listings/sale',
      );
      expect(url.searchParams.get('city')).toBe('Houston');
      expect(url.searchParams.get('state')).toBe('TX');
      expect(url.searchParams.get('status')).toBe('Active');
      expect(url.searchParams.get('propertyType')).toBe('Single Family');
      expect(url.searchParams.get('price')).toBe('100000:*');
      expect(url.searchParams.get('daysOld')).toBe('90:*');
      expect(url.searchParams.get('limit')).toBe('25');
      expect(url.searchParams.get('offset')).toBe('50');
      expect(url.searchParams.get('includeTotalCount')).toBe('true');
    });

    it('maps every non-active status to Inactive and leaves days on market to the local filter', () => {
      const url = new URL(
        RentCastListingsService.buildUrl({
          postalCode: '77008',
          status: ['Expired'],
          maxPrice: 300000,
          minDaysOnMarket: 90,
        }),
      );
      expect(url.searchParams.get('zipCode')).toBe('77008');
      expect(url.searchParams.get('status')).toBe('Inactive');
      expect(url.searchParams.get('price')).toBe('*:300000');
      expect(url.searchParams.get('daysOld')).toBeNull();
      expect(url.searchParams.get('limit')).toBe('50');
    });

    it('clamps the page size to 1..200', () => {
      const top = (limit: number) =>
        new URL(RentCastListingsService.buildUrl({ limit })).searchParams.get(
          'limit',
        );
      expect(top(999)).toBe('200');
      expect(top(0)).toBe('1');
    });
  });

  it('runs the request through cost control and normalizes the page', async () => {
    const out = await service.search({ city: 'San Antonio', state: 'TX' }, ctx);

    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'rentcast',
        action: 'search_listings',
        payload: { city: 'San Antonio', state: 'TX' },
        context: ctx,
      }),
    );
    expect(fetchSpy.mock.calls[0][1].headers).toEqual({
      'X-Api-Key': 'rc-key',
      Accept: 'application/json',
    });
    expect(out).toMatchObject({
      source: 'rentcast',
      feed: 'listings/sale',
      total: 7,
    });
    expect(out.listings).toHaveLength(1);
    expect(out.listings[0]).toMatchObject({
      listingKey: '5500-Grand-Lake-Dr,-San-Antonio,-TX-78244',
      mlsId: '1812345',
      status: 'Active',
      listPrice: 229900,
      address: {
        street: '5500 Grand Lake Dr',
        city: 'San Antonio',
        state: 'TX',
        postalCode: '78244',
      },
      propertyType: 'Single Family',
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1878,
      yearBuilt: 1973,
      daysOnMarket: 132,
      listDate: '2026-06-01T00:00:00.000Z',
      modifiedAt: '2026-10-10T00:00:00.000Z',
      listingAgent: {
        name: 'Alex Agent',
        phone: '2105550100',
        email: 'alex@example.com',
        office: 'Example Realty',
      },
    });
    expect(out.listings[0].raw).toEqual(rentcastListing);
  });

  it('refuses before spending when external data is off or the key is missing', async () => {
    controlPlane.isExternalDataEnabled.mockResolvedValueOnce(false);
    await expect(
      service.search({ city: 'Houston' }, ctx),
    ).rejects.toMatchObject({ reason: 'DISABLED' });

    secrets.resolve.mockResolvedValueOnce(null);
    await expect(
      service.search({ city: 'Houston' }, ctx),
    ).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });

    expect(costControl.checkAndCall).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps vendor failures to typed integration errors and treats 404 as no matches', async () => {
    fetchSpy.mockImplementationOnce(async () =>
      json({ error: 'bad key' }, 401),
    );
    await expect(
      service.search({ city: 'Houston' }, ctx),
    ).rejects.toMatchObject({ reason: 'REJECTED_CREDENTIALS' });

    fetchSpy.mockImplementationOnce(async () => json({ error: 'none' }, 404));
    expect(await service.search({ city: 'Houston' }, ctx)).toEqual({
      source: 'rentcast',
      feed: 'listings/sale',
      listings: [],
      total: 0,
    });

    fetchSpy.mockImplementationOnce(async () => json({}, 500));
    const err = await service.search({ city: 'Houston' }, ctx).catch((e) => e);
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    expect(err.reason).toBe('UPSTREAM_ERROR');
  });

  it('applies price and days-on-market floors locally too', () => {
    const cheapAndFresh = normalizeRentCastListing({
      ...rentcastListing,
      id: 'fresh',
      price: 50000,
      daysOnMarket: 10,
    });
    const out = applyLocalFilters(
      [normalizeRentCastListing(rentcastListing), cheapAndFresh],
      { minPrice: 100000, minDaysOnMarket: 90 },
    );
    expect(out.map((l) => l.listingKey)).toEqual([rentcastListing.id]);
  });

  it('tolerates sparse records', () => {
    const l = normalizeRentCastListing({ id: 'x' });
    expect(l.listingKey).toBe('x');
    expect(l.status).toBe('Unknown');
    expect(l.address).toEqual({
      street: '',
      city: '',
      state: '',
      postalCode: '',
    });
    expect(l.listingAgent).toBeNull();
  });
});
