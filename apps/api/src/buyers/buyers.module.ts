import { Module } from '@nestjs/common';
import { BuyersController } from './buyers.controller';
import { BuyersService } from './buyers.service';
import { TimelineModule } from '../timeline/timeline.module';
import { BuyerIntelligenceService } from './buyer-intelligence.service';
import { BuyerIntelligenceController } from './buyer-intelligence.controller';

@Module({
  imports: [TimelineModule],
  controllers: [BuyerIntelligenceController, BuyersController],
  providers: [BuyersService, BuyerIntelligenceService],
  exports: [BuyersService, BuyerIntelligenceService],
})
export class BuyersModule {}
