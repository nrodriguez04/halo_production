import { RealieService, normalizeRealieProperty } from '../realie.service';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';

/** A parcel in the nested v3 shape (docs.realie.ai/api-reference/v3/property-data-schema). */
const nested = {
  realieParcelId: '48201-0123456',
  parcelId: '0123456',
  state: 'TX',
  address: '123 Main St',
  zipCode: '77008',
  latitude: 29.8,
  longitude: -95.4,
  useCode: 1110,
  residential: true,
  propertyLocation: {
    addressLine1: '123 Main St',
    unitNumber: null,
    city: 'Houston',
    state: 'TX',
    zipCode: '77008',
  },
  propertyIdentification: {
    currentOwner: {
      ownerName: 'Jane Owner',
      ownerName2: 'John Owner',
      ownerOccupied: false,
      ownerAddress: '9 Elsewhere Ave',
      ownerCity: 'Austin',
      ownerState: 'Texas',
      ownerZipCode: '78701',
    },
  },
  valuationInformation: {
    totalMarketValue: 250000,
    totalAssessedValue: 210000,
  },
  realieValuation: { ml: { value: 262000 } },
  salesHistory: [
    {
      saleDate: '2019-04-01',
      salePrice: 180000,
      distressedSale: false,
      realEstateOwned: false,
    },
  ],
  building: {
    actualYearBuilt: 1978,
    totalBedrooms: 3,
    totalBathrooms: 2,
    livingArea: 1850,
  },
  landInformation: { acres: 0.18 },
  taxInformation: { taxStatus: 'delinquent' },
  liens: [{ lienType: 'LI0001' }],
  foreclosures: [],
  mortgages: [{ amount: 150000 }],
};

/** The same kind of parcel in the flat v2-compatible shape. */
const flat = {
  realieParcelId: '48201-0000001',
  parcelId: '0000001',
  address: '500 Oak St',
  city: 'Houston',
  state: 'TX',
  zipCode: '77008',
  county: 'Harris',
  ownerName: 'Sam Seller',
  ownerAddressLine1: '500 Oak St',
  ownerCity: 'Houston',
  ownerState: 'TX',
  ownerZipCode: '77008',
  totalMarketValue: 300000,
  transferDate: '2024-02-02',
  transferPrice: 280000,
  yearBuilt: 1990,
  totalBedrooms: 4,
  totalBathrooms: 2.5,
  livingArea: 2100,
  totalLienCount: 0,
  residential: true,
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('RealieService', () => {
  const ctx = {
    accountId: 'tenant-1',
    actor: 'user' as const,
    userId: 'user-1',
  };
  let controlPlane: { isExternalDataEnabled: jest.Mock };
  let costControl: { checkAndCall: jest.Mock };
  let secrets: { resolve: jest.Mock };
  let fetchSpy: jest.SpyInstance;
  let service: RealieService;

  beforeEach(() => {
    delete process.env.REALIE_BASE_URL;
    controlPlane = { isExternalDataEnabled: jest.fn().mockResolvedValue(true) };
    costControl = {
      checkAndCall: jest.fn(async (intent: any) => ({
        decision: { kind: 'ALLOW' },
        result: await intent.execute(),
      })),
    };
    secrets = {
      resolve: jest.fn(async (_provider: string, key: string) =>
        key === 'REALIE_API_KEY' ? 'rk-test' : null,
      ),
    };
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
      json({
        properties: [nested],
        metadata: { limit: 100, count: 1, nextCursor: 'c2' },
      }),
    );
    service = new RealieService(
      controlPlane as any,
      costControl as any,
      secrets as any,
    );
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("searches an area through cost control with Realie's parameters and the raw key header", async () => {
    const page = await service.searchProperties(
      {
        state: 'tx',
        city: 'Houston',
        residential: true,
        transferredWithinDays: 180,
        limit: 100,
      },
      ctx,
    );

    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'realie',
        action: 'search_properties',
        context: ctx,
      }),
    );
    const [url, init] = fetchSpy.mock.calls[0];
    const u = new URL(url as string);
    expect(u.origin + u.pathname).toBe(
      'https://app.realie.ai/api/public/property/search/',
    );
    expect(u.searchParams.get('state')).toBe('TX');
    expect(u.searchParams.get('city')).toBe('Houston');
    expect(u.searchParams.get('residential')).toBe('true');
    expect(u.searchParams.get('transferedSince')).toBe('180');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(u.searchParams.get('cursor')).toBe('start');
    expect(init.headers).toEqual({
      Authorization: 'rk-test',
      Accept: 'application/json',
    });

    expect(page.nextCursor).toBe('c2');
    expect(page.properties).toHaveLength(1);
    expect(page.properties[0]).toMatchObject({
      realieParcelId: '48201-0123456',
      parcelId: '0123456',
      address: {
        street: '123 Main St',
        city: 'Houston',
        state: 'TX',
        postalCode: '77008',
      },
      owner: {
        name: 'Jane Owner',
        name2: 'John Owner',
        occupied: false,
        mailingAddress: '9 Elsewhere Ave',
        mailingCity: 'Austin',
        mailingState: 'TX',
        mailingZip: '78701',
      },
      values: { market: 250000, assessed: 210000, estimate: 262000 },
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
        taxStatus: 'delinquent',
        lienCount: 1,
        foreclosure: false,
        mortgageCount: 1,
      },
    });
  });

  it('continues a cursor walk and caps the page size at 100', async () => {
    await service.searchProperties(
      { state: 'TX', zipCode: '77008', limit: 500, cursor: 'c2' },
      ctx,
    );
    const u = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(u.searchParams.get('zipCode')).toBe('77008');
    expect(u.searchParams.get('limit')).toBe('100');
    expect(u.searchParams.get('cursor')).toBe('c2');
  });

  it('treats 404 as no results (Realie does not bill it)', async () => {
    fetchSpy.mockImplementation(async () =>
      json({ error: 'No properties found' }, 404),
    );
    expect(
      await service.searchProperties({ state: 'WY', city: 'Nowhere' }, ctx),
    ).toEqual({
      properties: [],
      nextCursor: null,
    });
    expect(
      await service.lookupAddress(
        { address: '1 Nowhere Loop', state: 'WY' },
        ctx,
      ),
    ).toBeNull();
  });

  it('looks up one address, passing county (and city only with county) and reading the flat shape', async () => {
    fetchSpy.mockImplementation(async () => json({ property: flat }));

    const record = await service.lookupAddress(
      { address: '500 Oak St', state: 'TX', city: 'Houston', county: 'Harris' },
      ctx,
    );

    const u = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(u.origin + u.pathname).toBe(
      'https://app.realie.ai/api/public/property/address/',
    );
    expect(u.searchParams.get('address')).toBe('500 Oak St');
    expect(u.searchParams.get('county')).toBe('Harris');
    expect(u.searchParams.get('city')).toBe('Houston');
    expect(costControl.checkAndCall).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'realie', action: 'address_lookup' }),
    );
    expect(record).toMatchObject({
      realieParcelId: '48201-0000001',
      address: {
        street: '500 Oak St',
        city: 'Houston',
        state: 'TX',
        postalCode: '77008',
        county: 'Harris',
      },
      // No flag in the flat shape: the mailing address matching the site says owner-occupied.
      owner: {
        name: 'Sam Seller',
        occupied: true,
        mailingAddress: '500 Oak St',
      },
      values: { market: 300000 },
      lastSale: { date: '2024-02-02', price: 280000, distressed: false },
      building: {
        yearBuilt: 1990,
        bedrooms: 4,
        bathrooms: 2.5,
        livingArea: 2100,
      },
      distress: { lienCount: 0, foreclosure: false },
    });
  });

  it('drops city when county is missing, as Realie requires', async () => {
    fetchSpy.mockImplementation(async () => json({ property: flat }));
    await service.lookupAddress(
      { address: '500 Oak St', state: 'TX', city: 'Houston' },
      ctx,
    );
    const u = new URL(fetchSpy.mock.calls[0][0] as string);
    expect(u.searchParams.get('city')).toBeNull();
  });

  it("maps Realie's response codes to typed integration errors", async () => {
    fetchSpy.mockImplementationOnce(async () =>
      json({ error: 'Unauthorized: API key is missing/invalid' }, 401),
    );
    await expect(
      service.searchProperties({ state: 'TX' }, ctx),
    ).rejects.toMatchObject({
      reason: 'REJECTED_CREDENTIALS',
    });

    fetchSpy.mockImplementationOnce(async () =>
      json(
        {
          error: 'Spending limit reached',
          code: 'spend_limit',
          action: 'Raise the limit in Billing',
        },
        403,
      ),
    );
    const billing = await service
      .searchProperties({ state: 'TX' }, ctx)
      .catch((e) => e);
    expect(billing).toBeInstanceOf(IntegrationUnavailableException);
    expect(billing.reason).toBe('UPSTREAM_ERROR');
    expect(billing.message).toContain(
      'Spending limit reached Raise the limit in Billing',
    );

    fetchSpy.mockImplementationOnce(async () =>
      json({ error: 'Too many requests' }, 429),
    );
    const limited = await service
      .searchProperties({ state: 'TX' }, ctx)
      .catch((e) => e);
    expect(limited.message).toContain('rate limit');

    fetchSpy.mockImplementationOnce(async () =>
      json({ error: 'Internal Server Error' }, 500),
    );
    const down = await service
      .searchProperties({ state: 'TX' }, ctx)
      .catch((e) => e);
    expect(down.message).toContain('HTTP 500');
  });

  it('refuses before spending when external data is off or the key is missing', async () => {
    controlPlane.isExternalDataEnabled.mockResolvedValueOnce(false);
    await expect(
      service.searchProperties({ state: 'TX' }, ctx),
    ).rejects.toMatchObject({ reason: 'DISABLED' });
    secrets.resolve.mockResolvedValueOnce(null);
    await expect(
      service.searchProperties({ state: 'TX' }, ctx),
    ).rejects.toMatchObject({ reason: 'NOT_CONFIGURED' });
    expect(costControl.checkAndCall).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('honours REALIE_BASE_URL for a sandbox', async () => {
    process.env.REALIE_BASE_URL = 'https://sandbox.example.test/api/';
    await service.searchProperties({ state: 'TX' }, ctx);
    expect(fetchSpy.mock.calls[0][0]).toMatch(
      /^https:\/\/sandbox\.example\.test\/api\/public\/property\/search\/\?/,
    );
  });

  it('normalizes a sparse record without throwing', () => {
    const p = normalizeRealieProperty({ realieParcelId: 'x' });
    expect(p.address).toEqual({
      street: '',
      unit: null,
      city: '',
      state: '',
      postalCode: '',
      county: null,
    });
    expect(p.owner.occupied).toBeNull();
    expect(p.lastSale).toBeNull();
    expect(p.distress).toEqual({
      taxStatus: null,
      lienCount: 0,
      foreclosure: false,
      mortgageCount: 0,
    });
  });
});
