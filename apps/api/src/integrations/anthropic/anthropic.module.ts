import { Global, Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { AnthropicService } from './anthropic.service';

@Global()
@Module({
  imports: [IntegrationSecretsModule],
  providers: [AnthropicService],
  exports: [AnthropicService],
})
export class AnthropicModule {}
