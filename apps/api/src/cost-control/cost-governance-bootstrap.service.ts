import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  COST_GOVERNANCE_PROVIDER_KEYS,
  seedCostGovernanceBudgetBuckets,
  seedCostGovernanceReferenceData,
} from './seed-providers';

@Injectable()
export class CostGovernanceBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(CostGovernanceBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    const present = new Set(
      (
        await this.prisma.integrationProvider.findMany({
          select: { key: true },
        })
      ).map((row) => row.key),
    );
    const missing = COST_GOVERNANCE_PROVIDER_KEYS.filter(
      (key) => !present.has(key),
    );
    if (missing.length === 0) return;

    if (present.size === 0) {
      this.logger.warn(
        'integration_providers is empty; seeding default cost-governance reference data',
      );
    } else {
      this.logger.warn(
        `integration_providers is missing ${missing.join(', ')}; seeding those providers`,
      );
      // Providers already present keep their (possibly operator-tuned)
      // pricing; only the missing ones are written.
      await seedCostGovernanceReferenceData(this.prisma, missing);
      return;
    }

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
