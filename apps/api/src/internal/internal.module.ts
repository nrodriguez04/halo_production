import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';
import { GeocodingModule } from '../integrations/geocoding/geocoding.module';
import { AttomModule } from '../integrations/attom/attom.module';
import { PrismaService } from '../prisma.service';

// OpenAIModule / TwilioSendModule / EmailSendModule are @Global, so their
// services resolve without re-importing them here. Geocoding and ATTOM are
// not, hence the explicit imports.
@Module({
  imports: [GeocodingModule, AttomModule],
  controllers: [InternalController],
  providers: [PrismaService],
})
export class InternalModule {}
