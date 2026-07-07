import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  seedCostGovernanceBudgetBuckets,
  seedCostGovernanceReferenceData,
} from '../../prisma/seed-providers';

@Injectable()
export class CostGovernanceBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(CostGovernanceBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const providerCount = await this.prisma.integrationProvider.count();
    if (providerCount > 0) return;

    this.logger.warn(
      'integration_providers is empty; seeding default cost-governance reference data',
    );

    const accounts = await this.prisma.account.findMany({
      select: { id: true },
    });
    const bucketAccounts = new Set<string>(['GLOBAL']);
    for (const account of accounts) {
      bucketAccounts.add(account.id);
    }

    await seedCostGovernanceReferenceData(this.prisma);
    for (const accountId of bucketAccounts) {
      await seedCostGovernanceBudgetBuckets(this.prisma, accountId);
    }

    this.logger.log(
      `seeded default cost-governance data for ${bucketAccounts.size} account scope(s)`,
    );
  }
}
