import { Module } from '@nestjs/common';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { PrismaService } from '../prisma.service';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [TimelineModule, ControlPlaneModule],
  controllers: [AutomationController],
  providers: [AutomationService, PrismaService],
  exports: [AutomationService],
})
export class AutomationModule {}
