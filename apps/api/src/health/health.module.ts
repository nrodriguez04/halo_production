import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from '../prisma.service';
import { ControlPlaneModule } from '../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [HealthController],
  providers: [PrismaService],
})
export class HealthModule {}
