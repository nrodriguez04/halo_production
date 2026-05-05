import { Global, Module } from '@nestjs/common';
import { EmailSendService } from './email-send.service';

@Global()
@Module({
  providers: [EmailSendService],
  exports: [EmailSendService],
})
export class EmailSendModule {}
