import { Global, Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { TwilioSendService } from './twilio-send.service';

@Global()
@Module({
  imports: [IntegrationSecretsModule],
  providers: [TwilioSendService],
  exports: [TwilioSendService],
})
export class TwilioSendModule {}
