import { Module } from '@nestjs/common';
import { InternalController } from './internal.controller';

// OpenAIModule / TwilioSendModule / EmailSendModule are @Global, so their
// services resolve without re-importing them here.
@Module({
  controllers: [InternalController],
})
export class InternalModule {}
