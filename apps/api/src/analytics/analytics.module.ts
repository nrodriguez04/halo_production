import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FunnelService } from './funnel.service';
import { MarketingSpendService } from './marketing-spend.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, FunnelService, MarketingSpendService],
  exports: [AnalyticsService, FunnelService],
})
export class AnalyticsModule {}
