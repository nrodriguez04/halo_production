import { Module } from '@nestjs/common';
import { AttomController } from './attom.controller';
import { AttomService } from './attom.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';

@Module({
  imports: [ControlPlaneModule],
  controllers: [AttomController],
  providers: [AttomService, PrismaService],
  exports: [AttomService],
})
export class AttomModule {}

