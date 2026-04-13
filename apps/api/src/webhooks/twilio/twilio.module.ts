import { Module } from '@nestjs/common';
import { TwilioController } from './twilio.controller';
import { TwilioService } from './twilio.service';
import { PrismaService } from '../../prisma.service';

@Module({
  controllers: [TwilioController],
  providers: [TwilioService, PrismaService],
})
export class TwilioModule {}

