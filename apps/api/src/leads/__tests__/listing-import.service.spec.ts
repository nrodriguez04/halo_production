import { ListingImportService } from '../listing-import.service';
import { isSealedJson, openJson } from '../../pii/contact-crypto';
import type { Listing } from '../../integrations/listings/listing-source.types';

const listing = (over: Partial<Listing> = {}): Listing => ({
  listingKey: 'KEY-1',
  mlsId: 'MLS-1',
  status: 'Active',
  listPrice: 250000,
  address: {
    street: '123 Main St',
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
  modifiedAt: '2026-10-01T00:00:00Z',
  listingAgent: {
    name: 'Pat Agent',
    phone: '713-555-0100',
    email: 'pat@example.com',
    office: 'Example Realty',
  },
  raw: {
    ListingKey: 'KEY-1',
    ListAgentDirectPhone: '713-555-0100',
    ListPrice: 250000,
  },
  ...over,
});

const found = (
  over: Partial<ReturnType<typeof listing>>[] = [listing()],
  extra = {},
) => ({
  source: 'mls',
  feed: 'bridge',
  listings: over,
  total: over.length,
  ...extra,
});

describe('ListingImportService', () => {
  const env = { ...process.env };
  let prisma: {
    lead: { findMany: jest.Mock; update: jest.Mock };
    sourceRecord: { findFirst: jest.Mock; create: jest.Mock };
  };
  let leads: { importCSV: jest.Mock };
  let sources: { search: jest.Mock };
  let service: ListingImportService;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });
  afterAll(() => {
    process.env = env;
  });

  beforeEach(() => {
    prisma = {
      lead: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      sourceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'sr-1' }),
      },
    };
    leads = {
      importCSV: jest
        .fn()
        .mockResolvedValue({ created: 1, duplicates: 0, errors: [] }),
    };
    sources = { search: jest.fn().mockResolvedValue(found()) };
    service = new ListingImportService(
      prisma as any,
      leads as any,
      sources as any,
    );
  });

  it('searches the chosen source as the user and imports the usable listings through the CSV path', async () => {
    sources.search.mockResolvedValueOnce(
      found([
        listing(),
        listing({
          listingKey: 'NO-ADDRESS',
          address: {
            street: '',
            city: 'Houston',
            state: 'TX',
            postalCode: '77001',
          },
        }),
      ]),
    );

    const out = await service.importListings(
      'mls',
      { city: 'Houston', limit: 5 },
      'tenant-1',
      'user-1',
    );

    expect(sources.search).toHaveBeenCalledWith(
      'mls',
      { city: 'Houston', limit: 5 },
      { accountId: 'tenant-1', actor: 'user', userId: 'user-1' },
    );
    expect(leads.importCSV).toHaveBeenCalledWith(
      [
        {
          address: '123 Main St',
          city: 'Houston',
          state: 'TX',
          zip: '77001',
          notes:
            'MLS listing: MLS# MLS-1 · Active · $250,000 · 120 DOM · Residential · 3bd · 2ba · 1850 sqft',
        },
      ],
      'tenant-1',
      'user-1',
      { source: 'mls' },
    );
    expect(out).toEqual({
      source: 'mls',
      feed: 'bridge',
      searched: 2,
      total: 2,
      created: 1,
      duplicates: 0,
      errors: [],
    });
  });

  it('attaches a sealed source record and tags to the lead that owns the address', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      {
        id: 'lead-1',
        canonicalAddress: '123 MAIN ST.',
        canonicalZip: '77001',
        tags: ['hot'],
      },
    ]);

    await service.importListings(
      'mls',
      { city: 'Houston' },
      'tenant-1',
      'user-1',
    );

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { accountId: 'tenant-1', canonicalZip: { in: ['77001'] } },
      }),
    );
    expect(prisma.sourceRecord.create).toHaveBeenCalledTimes(1);
    const data = prisma.sourceRecord.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      leadId: 'lead-1',
      provider: 'mls',
      endpoint: 'Property',
      requestHash: 'KEY-1',
      trustWeight: 0.9,
    });
    // Non-contact facts stay queryable; the raw record (with the agent's
    // direct phone) is sealed.
    expect(data.response).toMatchObject({
      source: 'mls',
      listingKey: 'KEY-1',
      mlsId: 'MLS-1',
      status: 'Active',
      listPrice: 250000,
      daysOnMarket: 120,
      city: 'Houston',
      postalCode: '77001',
    });
    expect(isSealedJson(data.response)).toBe(true);
    expect(JSON.stringify(data.response)).not.toContain('713-555-0100');
    expect(openJson(data.response)).toEqual(listing().raw);

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { tags: ['hot', 'source:mls', 'listing:active', 'stale_listing'] },
    });
  });

  it('carries the owner of record, vendor provenance and signal tags for a Realie pull', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      {
        id: 'lead-1',
        canonicalAddress: '123 Main St',
        canonicalZip: '77001',
        tags: [],
      },
    ]);
    sources.search.mockResolvedValueOnce(
      found(
        [
          listing({
            listingKey: 'RP-1',
            mlsId: null,
            status: 'Absentee',
            listPrice: null,
            daysOnMarket: null,
            listingAgent: null,
            ownerName: 'Jane Owner',
            signals: ['owner:absentee', 'tax:delinquent'],
            summary:
              'absentee owner \u00b7 tax delinquent \u00b7 market value $250,000',
            raw: { realieParcelId: 'RP-1', ownerName: 'Jane Owner' },
          }),
        ],
        { source: 'realie', feed: 'public/property/search' },
      ),
    );

    const out = await service.importListings(
      'realie',
      { city: 'Houston', state: 'TX' },
      'tenant-1',
      'user-1',
    );

    expect(leads.importCSV.mock.calls[0][0][0]).toMatchObject({
      address: '123 Main St',
      owner: 'Jane Owner',
      notes:
        'Realie record: absentee owner \u00b7 tax delinquent \u00b7 market value $250,000',
    });
    expect(prisma.sourceRecord.create.mock.calls[0][0].data).toMatchObject({
      provider: 'realie',
      endpoint: 'public/property/search',
      requestHash: 'RP-1',
      trustWeight: 0.85,
    });
    // County records are not listings: owner signals instead of a listing:<status> tag.
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { tags: ['source:realie', 'owner:absentee', 'tax:delinquent'] },
    });
    expect(out).toMatchObject({
      source: 'realie',
      feed: 'public/property/search',
    });
  });

  it('tags by status and only flags listings on the market 90+ days as stale', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      {
        id: 'lead-1',
        canonicalAddress: '123 Main St',
        canonicalZip: '77001',
        tags: [],
      },
    ]);
    sources.search.mockResolvedValueOnce(
      found([listing({ status: 'Inactive', daysOnMarket: 12 })], {
        source: 'rentcast',
        feed: 'listings/sale',
      }),
    );

    await service.importListings(
      'rentcast',
      { city: 'Houston' },
      'tenant-1',
      'user-1',
    );

    expect(prisma.sourceRecord.create.mock.calls[0][0].data).toMatchObject({
      provider: 'rentcast',
      endpoint: 'listings/sale',
      trustWeight: 0.8,
    });
    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { tags: ['source:rentcast', 'listing:inactive'] },
    });
  });

  it('does not attach the same listing to a lead twice', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      {
        id: 'lead-1',
        canonicalAddress: '123 Main St',
        canonicalZip: '77001',
        tags: ['source:mls'],
      },
    ]);
    prisma.sourceRecord.findFirst.mockResolvedValueOnce({ id: 'sr-existing' });

    await service.importListings(
      'mls',
      { city: 'Houston' },
      'tenant-1',
      'user-1',
    );

    expect(prisma.sourceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1', provider: 'mls', requestHash: 'KEY-1' },
      }),
    );
    expect(prisma.sourceRecord.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('leaves the database alone when the search returns nothing', async () => {
    sources.search.mockResolvedValueOnce(found([]));
    leads.importCSV.mockResolvedValueOnce({
      created: 0,
      duplicates: 0,
      errors: [],
    });

    const out = await service.importListings(
      'mls',
      { postalCode: '77001' },
      'tenant-1',
      'user-1',
    );

    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(out).toMatchObject({ searched: 0, total: 0, created: 0 });
  });
});
