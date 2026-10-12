import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { PrismaService } from '../../prisma.service';
import { AutomationModule } from '../../automation/automation.module';
import { AgentModule } from '../../agent/agent.module';

@Module({
  imports: [AutomationModule, AgentModule],
  controllers: [TwilioController],
  providers: [TwilioService, PrismaService],
})
export class TwilioModule {}
