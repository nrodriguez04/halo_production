import { Module } from '@nestjs/common';
import { ControlPlaneController } from './control-plane.controller';
import { ControlPlaneService } from './control-plane.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ControlPlaneController],
  providers: [ControlPlaneService, PrismaService],
  exports: [ControlPlaneService],
})
export class ControlPlaneModule {}

