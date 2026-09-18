import { Global, Module } from '@nestjs/common';
import { EmailSendService } from './email-send.service';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Global()
@Module({
  imports: [IntegrationSecretsModule],
  providers: [EmailSendService],
  exports: [EmailSendService],
})
export class EmailSendModule {}
