import { Global, Module } from '@nestjs/common';
import { ApiCostService } from './api-cost.service';
import { ApiCostController } from './api-cost.controller';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ApiCostController],
  providers: [ApiCostService, PrismaService],
  exports: [ApiCostService],
})
export class ApiCostModule {}
