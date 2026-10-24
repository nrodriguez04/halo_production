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

  it('gives an existing AI provider web-research pricing: tokens plus each search', async () => {
    const prisma = {
      integrationProvider: {
        findUnique: jest.fn(async ({ where }: { where: { key: string } }) =>
          where.key === 'openai' ? { id: 'p-oa' } : null,
        ),
      },
      providerPricingRule: {
        findMany: jest
          .fn()
          .mockResolvedValue([
            { action: 'chat_completion.gpt-4o' },
            { action: 'chat_completion.gpt-4o-mini' },
            { action: 'chat_completion.gpt-4-turbo' },
          ]),
        createMany: jest.fn().mockResolvedValue({ count: 6 }),
      },
    };
    expect(await seedMissingPricingRules(prisma as any)).toBe(6);
    const rows = prisma.providerPricingRule.createMany.mock.calls[0][0].data;
    expect(
      rows
        .filter((r: { action: string }) => r.action === 'web_research.gpt-4o')
        .map((r: { unit: string; unitCostUsd: number }) => [
          r.unit,
          r.unitCostUsd,
        ]),
    ).toEqual([
      ['per_1k_input_tokens', 0.0025],
      ['per_1k_output_tokens', 0.01],
      ['per_search', 0.025],
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
