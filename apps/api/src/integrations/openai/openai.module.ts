import { Global, Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { OpenAIService } from './openai.service';

@Global()
@Module({
  imports: [IntegrationSecretsModule],
  providers: [OpenAIService],
  exports: [OpenAIService],
})
export class OpenAIModule {}
