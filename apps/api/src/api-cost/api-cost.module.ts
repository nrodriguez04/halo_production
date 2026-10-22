import { Global, Module } from '@nestjs/common';
import { ApiCostService } from './api-cost.service';
import { ApiCostController } from './api-cost.controller';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [ApiCostController],
  providers: [ApiCostService],
  exports: [ApiCostService],
})
export class ApiCostModule {}
