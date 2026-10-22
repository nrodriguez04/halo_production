import { Module } from '@nestjs/common';
import { DealEconomicsController } from './deal-economics.controller';
import { DealEconomicsService } from './deal-economics.service';

@Module({
  controllers: [DealEconomicsController],
  providers: [DealEconomicsService],
  exports: [DealEconomicsService],
})
export class DealEconomicsModule {}
