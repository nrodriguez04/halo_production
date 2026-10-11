import { Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { MlsService } from './mls.service';

// IntegrationCostControlService comes from the global CostControlModule.
@Module({
  imports: [IntegrationSecretsModule],
  providers: [MlsService],
  exports: [MlsService],
})
export class MlsModule {}
