import { Global, Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { OptOutService } from './opt-out.service';
import { DisclosureGateService } from './disclosure-gate.service';
import { DncRegistryService } from './dnc-registry.service';
import { DncRegistryController } from './dnc-registry.controller';

@Global()
@Module({
  controllers: [DncRegistryController],
  providers: [
    ComplianceService,
    OptOutService,
    DisclosureGateService,
    DncRegistryService,
  ],
  exports: [
    ComplianceService,
    OptOutService,
    DisclosureGateService,
    DncRegistryService,
  ],
})
export class ComplianceModule {}
