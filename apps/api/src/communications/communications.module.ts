import { Module } from '@nestjs/common';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { PrismaService } from '../prisma.service';
import { QueuesModule } from '../queues/queues.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [QueuesModule, TimelineModule],
  controllers: [CommunicationsController],
  providers: [CommunicationsService, PrismaService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}

