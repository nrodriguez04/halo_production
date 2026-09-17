import { Global, Module } from '@nestjs/common';
import { ControlPlaneController } from './control-plane.controller';
import { ControlPlaneService } from './control-plane.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

// Global: the kill switch is consulted from communications, marketing,
// underwriting, health and every integration adapter.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [ControlPlaneController],
  providers: [ControlPlaneService, PrismaService],
  exports: [ControlPlaneService],
})
export class ControlPlaneModule {}

