import { Module } from '@nestjs/common';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { RentCastController } from './rentcast.controller';
import { RentCastService } from './rentcast.service';

@Module({
  imports: [ControlPlaneModule, IntegrationSecretsModule],
  controllers: [RentCastController],
  providers: [RentCastService],
  exports: [RentCastService],
})
export class RentCastModule {}
