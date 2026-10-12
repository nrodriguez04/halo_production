import { Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { RealieService } from './realie.service';

// ControlPlaneService and IntegrationCostControlService come from global modules.
@Module({
  imports: [IntegrationSecretsModule],
  providers: [RealieService],
  exports: [RealieService],
})
export class RealieModule {}
