import { Module } from '@nestjs/common';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { RegridService } from './regrid.service';

@Module({
  imports: [ControlPlaneModule, IntegrationSecretsModule],
  providers: [RegridService],
  exports: [RegridService],
})
export class RegridModule {}
