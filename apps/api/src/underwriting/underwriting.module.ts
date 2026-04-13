import { Module } from '@nestjs/common';
import { UnderwritingController } from './underwriting.controller';
import { UnderwritingService } from './underwriting.service';
import { PrismaService } from '../prisma.service';
import { QueuesModule } from '../queues/queues.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [QueuesModule, TimelineModule],
  controllers: [UnderwritingController],
  providers: [UnderwritingService, PrismaService],
  exports: [UnderwritingService],
})
export class UnderwritingModule {}

