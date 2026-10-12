import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Module({
  imports: [ControlPlaneModule, IntegrationSecretsModule],
  controllers: [GeocodingController],
  providers: [GeocodingService, PrismaService],
  exports: [GeocodingService],
})
export class GeocodingModule {}
