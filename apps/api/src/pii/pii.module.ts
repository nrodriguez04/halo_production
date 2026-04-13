import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PIIService } from './pii.service';

@Module({
  providers: [PIIService, PrismaService],
  exports: [PIIService],
})
export class PIIModule {}
