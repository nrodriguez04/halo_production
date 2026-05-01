import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { PrismaService } from '../prisma.service';
import { CommunicationsModule } from '../communications/communications.module';
import { TimelineModule } from '../timeline/timeline.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [CommunicationsModule, TimelineModule, ControlPlaneModule],
  controllers: [AgentController],
  providers: [AgentService, PrismaService],
  exports: [AgentService],
})
export class AgentModule {}
