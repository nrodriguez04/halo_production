import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [HealthController],
  providers: [],
})
export class HealthModule {}
