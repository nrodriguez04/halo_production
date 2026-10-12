import { ResponseCacheService } from '../cache/response-cache.service';
import { responseContainsContacts } from '../policy/cache-ttl';
import { isSealedJson } from '../../pii/contact-crypto';

describe('ResponseCacheService contact payloads', () => {
  let prisma: any;
  let cache: ResponseCacheService;
  let rows: Map<string, any>;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(() => {
    rows = new Map();
    prisma = {
      cachedProviderResponse: {
        upsert: jest.fn(async (args: any) => {
          rows.set(
            args.where.accountId_providerKey_cacheKey.cacheKey,
            args.create,
          );
        }),
        findUnique: jest.fn(
          async (args: any) =>
            rows.get(args.where.accountId_providerKey_cacheKey.cacheKey) ??
            null,
        ),
      },
    };
    cache = new ResponseCacheService(prisma);
  });

  const payload = {
    phones: [{ phone: '5125550100', phone_type: 'mobile' }],
    emails: [{ email: 'owner@example.com' }],
  };

  it('seals a skip-trace response at rest and opens it on a hit', async () => {
    await cache.write({
      accountId: 'tenant-1',
      providerKey: 'batch_skiptrace',
      cacheKey: 'k1',
      payload,
      ttlSec: 60,
      sensitive: true,
    });

    const written = prisma.cachedProviderResponse.upsert.mock.calls[0][0];
    expect(isSealedJson(written.create.payload)).toBe(true);
    expect(isSealedJson(written.update.payload)).toBe(true);
    expect(JSON.stringify(written)).not.toContain('5125550100');
    expect(JSON.stringify(written)).not.toContain('owner@example.com');

    const hit = await cache.lookup('tenant-1', 'batch_skiptrace', 'k1');
    expect(hit?.payload).toEqual(payload);
  });

  it('leaves non-contact payloads as they were', async () => {
    const geocode = { lat: 30.2, lng: -97.7 };
    await cache.write({
      accountId: 'tenant-1',
      providerKey: 'google_geocoding',
      cacheKey: 'k2',
      payload: geocode,
      ttlSec: 60,
    });

    expect(
      prisma.cachedProviderResponse.upsert.mock.calls[0][0].create.payload,
    ).toEqual(geocode);
    expect(
      (await cache.lookup('tenant-1', 'google_geocoding', 'k2'))?.payload,
    ).toEqual(geocode);
  });

  it('treats every append_contacts action as carrying contacts', () => {
    expect(responseContainsContacts('batch_skiptrace', 'append_contacts')).toBe(
      true,
    );
    expect(responseContainsContacts('batch_skiptrace', 'append_contacts')).toBe(
      true,
    );
    expect(responseContainsContacts('batch_skiptrace', 'property_lookup')).toBe(
      false,
    );
  });
});
