import { Global, Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { OptOutService } from './opt-out.service';
import { DisclosureGateService } from './disclosure-gate.service';

@Global()
@Module({
  providers: [ComplianceService, OptOutService, DisclosureGateService],
  exports: [ComplianceService, OptOutService, DisclosureGateService],
})
export class ComplianceModule {}
