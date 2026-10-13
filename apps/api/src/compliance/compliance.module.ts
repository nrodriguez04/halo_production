import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ComplianceService } from './compliance.service';
import { OptOutService } from './opt-out.service';
import { DisclosureGateService } from './disclosure-gate.service';

@Global()
@Module({
  providers: [
    ComplianceService,
    OptOutService,
    DisclosureGateService,
    PrismaService,
  ],
  exports: [ComplianceService, OptOutService, DisclosureGateService],
})
export class ComplianceModule {}
