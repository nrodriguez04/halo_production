import { Module } from '@nestjs/common';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { AgentOrchestrationService } from './agent-orchestration.service';
import { AgentSweepService } from './agent-sweep.service';
import { PrismaService } from '../prisma.service';
import { CommunicationsModule } from '../communications/communications.module';
import { TimelineModule } from '../timeline/timeline.module';
import { ControlPlaneModule } from '../control-plane/control-plane.module';
import { AutomationModule } from '../automation/automation.module';
import { DealsModule } from '../deals/deals.module';
import { QueuesModule } from '../queues/queues.module';

// LeadLifecycleModule is @Global, so LeadLifecycleService resolves without an import.
@Module({
  imports: [
    CommunicationsModule,
    TimelineModule,
    ControlPlaneModule,
    AutomationModule,
    DealsModule,
    QueuesModule,
  ],
  controllers: [AgentController],
  providers: [
    AgentService,
    AgentOrchestrationService,
    AgentSweepService,
    PrismaService,
  ],
  exports: [AgentService, AgentOrchestrationService],
})
export class AgentModule {}
