import { Module } from '@nestjs/common';
import { InternalModule } from '../internal/internal.module';
import { IntegrationSecretsModule } from '../integration-secrets/integration-secrets.module';
import { CommunicationsAdminService } from './communications-admin.service';
import { CommunicationsAdminController } from './communications-admin.controller';

/** Communications settings, suppression and seller consent (docs/communications.md). */
@Module({
  imports: [InternalModule, IntegrationSecretsModule],
  controllers: [CommunicationsAdminController],
  providers: [CommunicationsAdminService],
})
export class CommunicationsAdminModule {}
