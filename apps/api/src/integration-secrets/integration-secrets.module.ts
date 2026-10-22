import { Module } from '@nestjs/common';
import { IntegrationSecretsController } from './integration-secrets.controller';
import { IntegrationSecretsService } from './integration-secrets.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationSecretsController],
  providers: [IntegrationSecretsService],
  exports: [IntegrationSecretsService],
})
export class IntegrationSecretsModule {}
