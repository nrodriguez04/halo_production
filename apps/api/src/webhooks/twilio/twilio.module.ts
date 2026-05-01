import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { PrismaService } from '../../prisma.service';
import { AutomationModule } from '../../automation/automation.module';

@Module({
  imports: [AutomationModule],
  controllers: [TwilioController],
  providers: [TwilioService, PrismaService],
})
export class TwilioModule {}
