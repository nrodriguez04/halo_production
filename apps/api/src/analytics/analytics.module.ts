import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { FunnelService } from './funnel.service';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, FunnelService],
  exports: [AnalyticsService, FunnelService],
})
export class AnalyticsModule {}
