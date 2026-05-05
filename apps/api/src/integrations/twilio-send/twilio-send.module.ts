import { Global, Module } from '@nestjs/common';
import { TwilioSendService } from './twilio-send.service';

@Global()
@Module({
  providers: [TwilioSendService],
  exports: [TwilioSendService],
})
export class TwilioSendModule {}
