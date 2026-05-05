import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma.service';
import { AggregatorService } from './aggregator.service';
import { AlertsService } from './alerts.service';
import { BudgetService } from './budget.service';
import { ResponseCacheService } from './cache/response-cache.service';
import { CostControlController } from './cost-control.controller';
import { IntegrationCostControlService } from './cost-control.service';
import { PricingService } from './pricing/pricing.service';
import { RateLimitService } from './rate-limit/rate-limit.service';

// Global module so any feature module can `inject(IntegrationCostControlService)`
// without re-importing CostControlModule. Mirrors ApiCostModule's pattern.

@Global()
@Module({
  imports: [AuthModule],
  controllers: [CostControlController],
  providers: [
    PrismaService,
    PricingService,
    BudgetService,
    ResponseCacheService,
    RateLimitService,
    AggregatorService,
    AlertsService,
    IntegrationCostControlService,
  ],
  exports: [
    IntegrationCostControlService,
    PricingService,
    BudgetService,
    ResponseCacheService,
  ],
})
export class CostControlModule {}
