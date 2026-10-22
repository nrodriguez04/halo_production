import { Global, Module } from '@nestjs/common';
import { PIIService } from './pii.service';

// Global: every response that can carry a contact (leads, deals, the agent
// context, buyers) presents it through PIIService so reveals are audited.
@Global()
@Module({
  providers: [PIIService],
  exports: [PIIService],
})
export class PIIModule {}
