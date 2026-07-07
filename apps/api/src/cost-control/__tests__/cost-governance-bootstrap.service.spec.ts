jest.mock('../../../prisma/seed-providers', () => ({
  seedCostGovernanceReferenceData: jest.fn(),
  seedCostGovernanceBudgetBuckets: jest.fn(),
}));

import { CostGovernanceBootstrapService } from '../cost-governance-bootstrap.service';
import {
  seedCostGovernanceBudgetBuckets,
  seedCostGovernanceReferenceData,
} from '../../../prisma/seed-providers';

describe('CostGovernanceBootstrapService', () => {
  let prisma: any;
  let service: CostGovernanceBootstrapService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = {
      integrationProvider: { count: jest.fn() },
      account: { findMany: jest.fn() },
    };
    service = new CostGovernanceBootstrapService(prisma);
  });

  it('seeds default governance data when the provider registry is empty', async () => {
    prisma.integrationProvider.count.mockResolvedValue(0);
    prisma.account.findMany.mockResolvedValue([{ id: 'acct_1' }, { id: 'acct_2' }]);

    await service.onModuleInit();

    expect(seedCostGovernanceReferenceData).toHaveBeenCalledWith(prisma);
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledTimes(3);
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(prisma, 'GLOBAL');
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(prisma, 'acct_1');
    expect(seedCostGovernanceBudgetBuckets).toHaveBeenCalledWith(prisma, 'acct_2');
  });

  it('skips seeding when providers already exist', async () => {
    prisma.integrationProvider.count.mockResolvedValue(4);

    await service.onModuleInit();

    expect(prisma.account.findMany).not.toHaveBeenCalled();
    expect(seedCostGovernanceReferenceData).not.toHaveBeenCalled();
    expect(seedCostGovernanceBudgetBuckets).not.toHaveBeenCalled();
  });
});
