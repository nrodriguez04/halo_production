import { Module } from '@nestjs/common';
import { PublicGisService } from './public-gis.service';

// ControlPlaneService and IntegrationCostControlService come from global modules.
@Module({
  providers: [PublicGisService],
  exports: [PublicGisService],
})
export class PublicGisModule {}
