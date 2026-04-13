import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [TimelineModule],
  controllers: [DealsController],
  providers: [DealsService, PrismaService],
  exports: [DealsService],
})
export class DealsModule {}

