import { Module } from '@nestjs/common';
import { DealEconomicsController } from './deal-economics.controller';
import { DealEconomicsService } from './deal-economics.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [DealEconomicsController],
  providers: [DealEconomicsService, PrismaService],
  exports: [DealEconomicsService],
})
export class DealEconomicsModule {}
