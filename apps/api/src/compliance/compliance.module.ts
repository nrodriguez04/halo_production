import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ComplianceService } from './compliance.service';

@Global()
@Module({
  providers: [ComplianceService, PrismaService],
  exports: [ComplianceService],
})
export class ComplianceModule {}
