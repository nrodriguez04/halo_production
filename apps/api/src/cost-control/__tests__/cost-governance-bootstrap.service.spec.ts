jest.mock('../seed-providers', () => ({
  COST_GOVERNANCE_PROVIDER_KEYS: ['attom', 'openai', 'sendgrid', 'smtp'],
  seedCostGovernanceReferenceData: jest.fn(),
  seedCostGovernanceBudgetBuckets: jest.fn(),
}));

import { CostGovernanceBootstrapService } from '../cost-governance-bootstrap.service';
import {
  seedCostGovernanceBudgetBuckets,
  seedCostGovernanceReferenceData,
} from '../seed-providers';

describe('CostGovernanceBootstrapService', () => {
  let prisma: any;
  let service: CostGovernanceBootstrapService;

  const registry = (...keys: string[]) =>
    prisma.integrationProvider.findMany.mockResolvedValue(
      keys.map((key) => ({ key })),
    );

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      integrationProvider: { findMany: jest.fn() },
      account: { findMany: jest.fn() },
    };
    service = new CostGovernanceBootstrapService(prisma);
  });

  it('seeds default governance data when the provider registry is empty', async () => {
    registry();
    prisma.account.findMany.mockResolvedValue([
      { id: 'acct_1' },
      { id: 'acct_2' },
    ]);

    await service.onModuleInit();

    expect(seedCostGovernanceReferenceData).toHaveBeenCalledWith(prisma);
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledTimes(3);
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(
      prisma,
      'GLOBAL',
    );
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(
      prisma,
      'acct_1',
    );
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(
      prisma,
      'acct_2',
    );
  });

  it('does nothing when every known provider is registered', async () => {
    registry('attom', 'openai', 'sendgrid', 'smtp', 'some-operator-added-key');

    await service.onModuleInit();

    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(seedCostGovernanceReferenceData).not.toHaveBeenCalled();
    expect(seedCostGovernanceBudgetBuckets).not.toHaveBeenCalled();
  });

  it('seeds only the missing providers on a populated registry', async () => {
    // A provider added to the seed after first deploy (or a stub left by a
    // migration) is written; existing providers keep their tuned pricing,
    // and budget buckets are not re-seeded.
    registry('attom', 'openai');

    await service.onModuleInit();

    expect(seedCostGovernanceReferenceData).toHaveBeenCalledWith(prisma, [
      'sendgrid',
      'smtp',
    ]);
    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(seedCostGovernanceBudgetBuckets).not.toHaveBeenCalled();
  });
});
