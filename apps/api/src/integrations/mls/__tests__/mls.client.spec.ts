import { MlsClient, normalizeReso, normalizeSimplyRets } from '../mls.client';
import { IntegrationUnavailableException } from '../../integration-unavailable.exception';
import type { MlsConfig } from '../mls.types';

const bridge: MlsConfig = {
  dialect: 'bridge',
  baseUrl: 'https://api.bridgedataoutput.com/api/v2/OData',
  dataset: 'actris',
  token: 'server-token',
};
const reso: MlsConfig = {
  dialect: 'reso',
  baseUrl: 'https://api.mlsgrid.com/v2/',
  token: 'bearer-token',
};
const simplyrets: MlsConfig = {
  dialect: 'simplyrets',
  baseUrl: 'https://api.simplyrets.com',
  username: 'simplyrets',
  password: 'simplyrets',
};

/** One Property record in RESO Data Dictionary field names, as Bridge serves it. */
const resoRecord = {
  ListingKey: 'P_5dba1fb94aa4055b9f29691f',
  ListingId: 'MLS-1234',
  StandardStatus: 'Active',
  ListPrice: 250000,
  StreetNumber: '123',
  StreetName: 'Main',
  StreetSuffix: 'St',
  UnitNumber: '4B',
  UnparsedAddress: '123 Main St 4B, Houston, TX 77001',
  City: 'Houston',
  StateOrProvince: 'TX',
  PostalCode: '77001',
  PropertyType: 'Residential',
  BedroomsTotal: 3,
  BathroomsTotalInteger: 2,
  LivingArea: 1850,
  YearBuilt: 1978,
  DaysOnMarket: 120,
  ListingContractDate: '2026-06-10',
  ModificationTimestamp: '2026-10-01T12:00:00Z',
  ListAgentFullName: 'Pat Agent',
  ListAgentDirectPhone: '713-555-0100',
  ListAgentEmail: 'pat@example.com',
  ListOfficeName: 'Example Realty',
};

/** One listing in the SimplyRETS JSON shape (api.simplyrets.com demo feed). */
const simplyRetsRecord = {
  mlsId: 1005123,
  listingId: '80074466',
  listPrice: 189900,
  listDate: '2026-07-01T00:00:00.000Z',
  modified: '2026-10-01T10:00:00.000Z',
  address: {
    full: '74434 Island Shore Ave',
    streetNumberText: '74434',
    streetName: 'Island Shore Ave',
    city: 'Houston',
    state: 'Texas',
    postalCode: '77008',
  },
  property: {
    type: 'RES',
    subType: 'SingleFamilyResidence',
    bedrooms: 3,
    bathsFull: 2,
    area: 1550,
    yearBuilt: 1962,
  },
  mls: { status: 'Active', daysOnMarket: 134, area: 'Heights' },
  agent: {
    firstName: 'Kristin',
    lastName: 'Smith',
    contact: {
      cell: '713-555-0199',
      email: 'kristin@example.com',
      office: '713-555-0100',
    },
  },
  office: { name: 'Example Realty' },
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

function client(config: MlsConfig, fetchMock: jest.Mock): MlsClient {
  return new MlsClient(config, fetchMock as unknown as typeof fetch);
}
function requestedUrl(fetchMock: jest.Mock): URL {
  return new URL(fetchMock.mock.calls[0][0] as string);
}
function requestedHeaders(fetchMock: jest.Mock): Record<string, string> {
  return fetchMock.mock.calls[0][1].headers;
}

async function failure(
  promise: Promise<unknown>,
): Promise<IntegrationUnavailableException> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(IntegrationUnavailableException);
    return err as IntegrationUnavailableException;
  }
  throw new Error('expected the search to fail');
}

describe('MlsClient.resoFilter', () => {
  it('defaults to active listings', () => {
    expect(MlsClient.resoFilter({})).toBe("StandardStatus eq 'Active'");
  });

  it('builds one OData filter from every criterion, quoting and escaping strings', () => {
    expect(
      MlsClient.resoFilter({
        status: ['Active', 'Pending'],
        city: "O'Fallon",
        state: 'MO',
        postalCode: '63366',
        propertyType: 'Residential',
        minPrice: 100000,
        maxPrice: 300000,
        minDaysOnMarket: 90,
      }),
    ).toBe(
      "(StandardStatus eq 'Active' or StandardStatus eq 'Pending') and City eq 'O''Fallon' " +
        "and StateOrProvince eq 'MO' and PostalCode eq '63366' and PropertyType eq 'Residential' " +
        'and ListPrice ge 100000 and ListPrice le 300000 and DaysOnMarket ge 90',
    );
  });
});

describe('MlsClient bridge dialect', () => {
  it('queries the dataset Property resource with the server token as a query parameter', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () =>
        json({ '@odata.count': 1, value: [resoRecord] }),
      );

    const out = await client(bridge, fetchMock).search({
      city: 'Houston',
      limit: 25,
      offset: 50,
    });

    const url = requestedUrl(fetchMock);
    expect(url.origin + url.pathname).toBe(
      'https://api.bridgedataoutput.com/api/v2/OData/actris/Property',
    );
    expect(url.searchParams.get('$filter')).toBe(
      "StandardStatus eq 'Active' and City eq 'Houston'",
    );
    expect(url.searchParams.get('$top')).toBe('25');
    expect(url.searchParams.get('$skip')).toBe('50');
    expect(url.searchParams.get('$orderby')).toBe('ModificationTimestamp desc');
    expect(url.searchParams.get('$count')).toBe('true');
    expect(url.searchParams.get('access_token')).toBe('server-token');
    expect(requestedHeaders(fetchMock)).not.toHaveProperty('Authorization');
    // Spaces travel as %20, never as +, which some OData servers take literally.
    expect(fetchMock.mock.calls[0][0]).toContain('StandardStatus%20eq%20');
    expect(fetchMock.mock.calls[0][0]).not.toContain('+');

    expect(out.dialect).toBe('bridge');
    expect(out.total).toBe(1);
    expect(out.listings).toHaveLength(1);
    expect(out.listings[0]).toMatchObject({
      listingKey: 'P_5dba1fb94aa4055b9f29691f',
      mlsId: 'MLS-1234',
      status: 'Active',
      listPrice: 250000,
      address: {
        street: '123 Main St 4B',
        city: 'Houston',
        state: 'TX',
        postalCode: '77001',
      },
      propertyType: 'Residential',
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1850,
      yearBuilt: 1978,
      daysOnMarket: 120,
      listDate: '2026-06-10',
      modifiedAt: '2026-10-01T12:00:00Z',
      listingAgent: {
        name: 'Pat Agent',
        phone: '713-555-0100',
        email: 'pat@example.com',
        office: 'Example Realty',
      },
    });
    expect(out.listings[0].raw).toEqual(resoRecord);
  });

  it('surfaces the Bridge error envelope as an upstream error', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () =>
        json({ error: { code: 400, message: 'Invalid $filter' } }),
      );

    const err = await failure(client(bridge, fetchMock).search({}));

    expect(err.reason).toBe('UPSTREAM_ERROR');
    expect(err.message).toContain('400 Invalid $filter');
  });

  it('reports 401/403 as rejected credentials and other failures as upstream errors', async () => {
    const forbidden = jest
      .fn()
      .mockImplementation(async () => json({ error: { code: 403 } }, 403));
    expect((await failure(client(bridge, forbidden).search({}))).reason).toBe(
      'REJECTED_CREDENTIALS',
    );

    const unauthorized = jest
      .fn()
      .mockImplementation(async () => json({}, 401));
    expect((await failure(client(reso, unauthorized).search({}))).reason).toBe(
      'REJECTED_CREDENTIALS',
    );

    const serverError = jest.fn().mockImplementation(async () => json({}, 500));
    const upstream = await failure(client(reso, serverError).search({}));
    expect(upstream.reason).toBe('UPSTREAM_ERROR');
    expect(upstream.message).toContain('HTTP 500');

    const network = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const unreachable = await failure(client(reso, network).search({}));
    expect(unreachable.reason).toBe('UPSTREAM_ERROR');
    expect(unreachable.message).toContain('ECONNRESET');
  });

  it('clamps the page size to 1..200 and defaults to 50', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => json({ value: [] }));
    const c = client(bridge, fetchMock);

    await c.search({ limit: 999 });
    await c.search({ limit: 0 });
    await c.search({});

    const tops = fetchMock.mock.calls.map((call) =>
      new URL(call[0]).searchParams.get('$top'),
    );
    expect(tops).toEqual(['200', '1', '50']);
  });

  it('returns a null total when the feed does not count', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => json({ value: [resoRecord] }));
    const out = await client(bridge, fetchMock).search({});
    expect(out.total).toBeNull();
  });
});

describe('MlsClient reso dialect', () => {
  it('sends a bearer token to the base URL as given, without an access_token parameter', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => json({ value: [] }));

    await client(reso, fetchMock).search({ postalCode: '77001' });

    const url = requestedUrl(fetchMock);
    expect(url.origin + url.pathname).toBe(
      'https://api.mlsgrid.com/v2/Property',
    );
    expect(url.searchParams.get('access_token')).toBeNull();
    expect(requestedHeaders(fetchMock).Authorization).toBe(
      'Bearer bearer-token',
    );
  });
});

describe('MlsClient simplyrets dialect', () => {
  it('uses basic auth and the SimplyRETS query vocabulary, taking the total from X-Total-Count', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () =>
        json([simplyRetsRecord], 200, { 'X-Total-Count': '42' }),
      );

    const out = await client(simplyrets, fetchMock).search({
      city: 'Houston',
      status: ['Active', 'Pending'],
      minPrice: 100000,
      maxPrice: 300000,
      propertyType: 'Residential',
      limit: 10,
      offset: 20,
    });

    const url = requestedUrl(fetchMock);
    expect(url.origin + url.pathname).toBe(
      'https://api.simplyrets.com/properties',
    );
    expect(url.searchParams.getAll('status')).toEqual(['Active', 'Pending']);
    expect(url.searchParams.get('cities')).toBe('Houston');
    expect(url.searchParams.get('minprice')).toBe('100000');
    expect(url.searchParams.get('maxprice')).toBe('300000');
    expect(url.searchParams.get('type')).toBe('residential');
    expect(url.searchParams.get('limit')).toBe('10');
    expect(url.searchParams.get('offset')).toBe('20');
    expect(requestedHeaders(fetchMock).Authorization).toBe(
      `Basic ${Buffer.from('simplyrets:simplyrets').toString('base64')}`,
    );

    expect(out.dialect).toBe('simplyrets');
    expect(out.total).toBe(42);
    expect(out.listings[0]).toMatchObject({
      listingKey: '1005123',
      mlsId: '80074466',
      status: 'Active',
      listPrice: 189900,
      address: {
        street: '74434 Island Shore Ave',
        city: 'Houston',
        state: 'Texas',
        postalCode: '77008',
      },
      propertyType: 'RES',
      bedrooms: 3,
      bathrooms: 2,
      livingArea: 1550,
      yearBuilt: 1962,
      daysOnMarket: 134,
      listDate: '2026-07-01T00:00:00.000Z',
      listingAgent: {
        name: 'Kristin Smith',
        phone: '713-555-0199',
        email: 'kristin@example.com',
        office: 'Example Realty',
      },
    });
  });

  it('applies the days-on-market floor client-side because the feed has no such filter', async () => {
    const fresh = {
      ...simplyRetsRecord,
      mlsId: 2,
      mls: { status: 'Active', daysOnMarket: 12 },
    };
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => json([simplyRetsRecord, fresh]));

    const out = await client(simplyrets, fetchMock).search({
      minDaysOnMarket: 90,
    });

    expect(out.listings.map((l) => l.listingKey)).toEqual(['1005123']);
    expect(out.total).toBeNull();
  });
});

describe('normalizeReso', () => {
  it('prefers the atomic street fields and falls back to UnparsedAddress', () => {
    expect(normalizeReso(resoRecord).address.street).toBe('123 Main St 4B');
    expect(
      normalizeReso({ UnparsedAddress: '9 Elm Ave', PostalCode: '77001' })
        .address.street,
    ).toBe('9 Elm Ave');
    expect(
      normalizeReso({
        StreetNumber: '9',
        StreetName: 'Elm',
        StreetDirSuffix: 'NW',
      }).address.street,
    ).toBe('9 Elm NW');
  });

  it('tolerates sparse records', () => {
    const l = normalizeReso({ ListingId: 'X1', MlsStatus: 'Hold' });
    expect(l.listingKey).toBe('X1');
    expect(l.status).toBe('Hold');
    expect(l.listPrice).toBeNull();
    expect(l.listingAgent).toBeNull();
    expect(normalizeReso({}).status).toBe('Unknown');
  });
});

describe('normalizeSimplyRets', () => {
  it('keeps the MLS number separate from the vendor record id', () => {
    const l = normalizeSimplyRets(simplyRetsRecord);
    expect(l.listingKey).toBe('1005123');
    expect(l.mlsId).toBe('80074466');
  });

  it('tolerates sparse records', () => {
    const l = normalizeSimplyRets({ mlsId: 7 });
    expect(l.listingKey).toBe('7');
    expect(l.mlsId).toBe('7');
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
