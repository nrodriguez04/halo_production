import { Module } from '@nestjs/common';
import { GeocodingController } from './geocoding.controller';
import { GeocodingService } from './geocoding.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [GeocodingController],
  providers: [GeocodingService, PrismaService],
  exports: [GeocodingService],
})
export class GeocodingModule {}

