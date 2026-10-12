import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';
import { AutomationModule } from '../automation/automation.module';
import { QueuesModule } from '../queues/queues.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [TimelineModule, AutomationModule, QueuesModule, ControlPlaneModule],
  controllers: [DealsController],
  providers: [DealsService, PrismaService],
  exports: [DealsService],
})
export class DealsModule {}
