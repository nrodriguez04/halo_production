import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { GeocodingModule } from '../integrations/geocoding/geocoding.module';
import { AttomModule } from '../integrations/attom/attom.module';
import { PrismaService } from '../prisma.service';
import { MessageDispatchService } from '../communications/message-dispatch.service';

// OpenAIModule / TwilioSendModule / EmailSendModule, ComplianceModule,
// ControlPlaneModule and SkipTraceModule are @Global, so their services
// resolve without re-importing them here. Geocoding and ATTOM are not,
// hence the explicit imports.
@Module({
  imports: [GeocodingModule, AttomModule],
  controllers: [InternalController],
  providers: [PrismaService, MessageDispatchService],
})
export class InternalModule {}
