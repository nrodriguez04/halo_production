import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module';
import { InternalController } from './internal.controller';
import { GeocodingModule } from '../integrations/geocoding/geocoding.module';
import { AttomModule } from '../integrations/attom/attom.module';
import { PrismaService } from '../prisma.service';
import { MessageDispatchService } from '../communications/message-dispatch.service';
import { DealsModule } from '../deals/deals.module';
import { DispositionGateModule } from '../disposition/disposition-gate.module';

// OpenAIModule / TwilioSendModule / EmailSendModule, ComplianceModule,
// ControlPlaneModule and SkipTraceModule are @Global, so their services
// resolve without re-importing them here. Geocoding and ATTOM are not,
// hence the explicit imports.
@Module({
  imports: [
    GeocodingModule,
    AttomModule,
    AgentModule,
    DealsModule,
    DispositionGateModule,
  ],
  controllers: [InternalController],
  providers: [PrismaService, MessageDispatchService],
})
export class InternalModule {}
