import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ComplianceService } from './compliance.service';
import { OptOutService } from './opt-out.service';

@Global()
@Module({
  providers: [ComplianceService, OptOutService, PrismaService],
  exports: [ComplianceService, OptOutService],
})
export class ComplianceModule {}
