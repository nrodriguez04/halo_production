import { Module } from '@nestjs/common';
import { MarketingController } from './marketing.controller';
import { MarketingService } from './marketing.service';
import { PrismaService } from '../prisma.service';
import { QueuesModule } from '../queues/queues.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [QueuesModule, TimelineModule],
  controllers: [MarketingController],
  providers: [MarketingService, PrismaService],
  exports: [MarketingService],
})
export class MarketingModule {}


