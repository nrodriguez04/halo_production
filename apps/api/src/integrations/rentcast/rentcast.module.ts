import { Module } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { RentCastController } from './rentcast.controller';
import { RentCastService } from './rentcast.service';

@Module({
  imports: [ControlPlaneModule],
  controllers: [RentCastController],
  providers: [RentCastService, PrismaService],
  exports: [RentCastService],
})
export class RentCastModule {}
