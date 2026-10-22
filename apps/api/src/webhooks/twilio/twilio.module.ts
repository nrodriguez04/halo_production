import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { AutomationModule } from '../../automation/automation.module';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [AutomationModule, AgentModule],
  controllers: [TwilioController],
  providers: [TwilioService],
})
export class TwilioModule {}
