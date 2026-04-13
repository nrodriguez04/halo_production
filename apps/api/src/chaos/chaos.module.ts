import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ChaosController, DLQController } from './chaos.controller';
import { ChaosService } from './chaos.service';

@Module({
  imports: [AuthModule],
  controllers: [ChaosController, DLQController],
  providers: [ChaosService],
  exports: [ChaosService],
})
export class ChaosModule {}
