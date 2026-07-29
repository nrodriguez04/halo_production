import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaService } from '../prisma.service';
import { ChaosController, DLQController } from './chaos.controller';
import { ChaosService } from './chaos.service';

@Module({
  imports: [AuthModule],
  controllers: [ChaosController, DLQController],
  providers: [ChaosService, PrismaService],
  exports: [ChaosService],
})
export class ChaosModule {}
