import { MlsImportService } from '../mls-import.service';
import { isSealedJson, openJson } from '../../pii/contact-crypto';
import type { MlsListing } from '../../integrations/mls/mls.types';

const listing = (over: Partial<MlsListing> = {}): MlsListing => ({
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

describe('MlsImportService', () => {
  const env = { ...process.env };
  let prisma: {
    lead: { findMany: jest.Mock; update: jest.Mock };
    sourceRecord: { findFirst: jest.Mock; create: jest.Mock };
  };
  let leads: { importCSV: jest.Mock };
  let mls: { searchListings: jest.Mock };
  let service: MlsImportService;

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
    mls = {
      searchListings: jest.fn().mockResolvedValue({
        listings: [listing()],
        total: 1,
        dialect: 'bridge',
      }),
    };
    service = new MlsImportService(prisma as any, leads as any, mls as any);
  });

  it('searches the feed as the user and imports the usable listings through the CSV path', async () => {
    mls.searchListings.mockResolvedValueOnce({
      listings: [
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
      ],
      total: 2,
      dialect: 'bridge',
    });

    const out = await service.importListings(
      { city: 'Houston', limit: 5 },
      'tenant-1',
      'user-1',
    );

    expect(mls.searchListings).toHaveBeenCalledWith(
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
    );
    expect(out).toEqual({
      searched: 2,
      total: 2,
      created: 1,
      duplicates: 0,
      errors: [],
      dialect: 'bridge',
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

    await service.importListings({ city: 'Houston' }, 'tenant-1', 'user-1');

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
      data: { tags: ['hot', 'mls', 'mls:active', 'stale_listing'] },
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
    mls.searchListings.mockResolvedValueOnce({
      listings: [
        listing({ status: 'Active Under Contract', daysOnMarket: 12 }),
      ],
      total: 1,
      dialect: 'simplyrets',
    });

    await service.importListings({ city: 'Houston' }, 'tenant-1', 'user-1');

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1' },
      data: { tags: ['mls', 'mls:active_under_contract'] },
    });
  });

  it('does not attach the same listing to a lead twice', async () => {
    prisma.lead.findMany.mockResolvedValueOnce([
      {
        id: 'lead-1',
        canonicalAddress: '123 Main St',
        canonicalZip: '77001',
        tags: ['mls'],
      },
    ]);
    prisma.sourceRecord.findFirst.mockResolvedValueOnce({ id: 'sr-existing' });

    await service.importListings({ city: 'Houston' }, 'tenant-1', 'user-1');

    expect(prisma.sourceRecord.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { leadId: 'lead-1', provider: 'mls', requestHash: 'KEY-1' },
      }),
    );
    expect(prisma.sourceRecord.create).not.toHaveBeenCalled();
    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it('leaves the database alone when the search returns nothing', async () => {
    mls.searchListings.mockResolvedValueOnce({
      listings: [],
      total: 0,
      dialect: 'bridge',
    });
    leads.importCSV.mockResolvedValueOnce({
      created: 0,
      duplicates: 0,
      errors: [],
    });

    const out = await service.importListings(
      { postalCode: '77001' },
      'tenant-1',
      'user-1',
    );

    expect(prisma.lead.findMany).not.toHaveBeenCalled();
    expect(out).toMatchObject({ searched: 0, total: 0, created: 0 });
  });
});
