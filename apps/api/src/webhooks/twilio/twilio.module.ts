import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { AutomationModule } from '../../automation/automation.module';
import { AgentModule } from '../../agent/agent.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Module({
  imports: [AutomationModule, AgentModule, IntegrationSecretsModule],
  controllers: [TwilioController],
  providers: [TwilioService],
})
export class TwilioModule {}
