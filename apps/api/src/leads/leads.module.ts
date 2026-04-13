import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, PrismaService],
  exports: [LeadsService],
})
export class LeadsModule {}

