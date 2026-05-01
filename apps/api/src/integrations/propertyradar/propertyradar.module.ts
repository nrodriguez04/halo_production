import { Module } from '@nestjs/common';
import { PropertyRadarController } from './propertyradar.controller';
import { PropertyRadarService } from './propertyradar.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [PropertyRadarController],
  providers: [PropertyRadarService, PrismaService],
  exports: [PropertyRadarService],
})
export class PropertyRadarModule {}
