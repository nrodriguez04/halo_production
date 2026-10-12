import { seedMissingPricingRules } from '../seed-providers';

describe('seedMissingPricingRules', () => {
  it('adds only the seed actions an existing provider lacks and leaves its other rules alone', async () => {
    // rentcast and realie exist from an older seed, before their search
    // actions were added; every other provider is absent.
    const ids: Record<string, string> = { rentcast: 'p-rc', realie: 'p-re' };
    const existingActions: Record<string, string[]> = {
      'p-rc': ['value_estimate', 'rent_estimate', 'listings', 'property'],
      'p-re': ['address_lookup'],
    };
    const prisma = {
      integrationProvider: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          ids[where.key] ? { id: ids[where.key] } : null,
        ),
      },
      providerPricingRule: {
        findMany: jest.fn(
          async ({ where }: { where: { providerId: string } }) =>
            existingActions[where.providerId].map((action) => ({ action })),
        ),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        deleteMany: jest.fn(),
      },
    };

    const added = await seedMissingPricingRules(prisma as any);

    expect(added).toBe(2);
    expect(prisma.providerPricingRule.deleteMany).not.toHaveBeenCalled();
    expect(prisma.providerPricingRule.createMany).toHaveBeenCalledTimes(2);
    const rows = prisma.providerPricingRule.createMany.mock.calls.flatMap(
      (call) => call[0].data,
    );
    expect(rows).toEqual([
      {
        providerId: 'p-rc',
        action: 'search_listings',
        unitCostUsd: 0.05,
        unit: 'per_call',
        pricePer: 1,
      },
      {
        providerId: 'p-re',
        action: 'search_properties',
        unitCostUsd: 0.05,
        unit: 'per_call',
        pricePer: 1,
      },
    ]);
  });

  it('writes nothing when every known action already has a rule', async () => {
    const prisma = {
      integrationProvider: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          where.key === 'google_geocoding' ? { id: 'p-geo' } : null,
        ),
      },
      providerPricingRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { action: 'geocode' },
            { action: 'reverse_geocode' },
          ]),
        createMany: jest.fn(),
      },
    };

    expect(await seedMissingPricingRules(prisma as any)).toBe(0);
    expect(prisma.providerPricingRule.createMany).not.toHaveBeenCalled();
  });
});
