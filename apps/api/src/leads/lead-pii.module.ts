import { Global, Module } from '@nestjs/common';
import { LeadPiiService } from './lead-pii.service';

// Global: contact PII is touched from leads, skip-trace, the Twilio webhook,
// DocuSign and the agent, and the service has no dependencies of its own.
@Global()
@Module({
  providers: [LeadPiiService],
  exports: [LeadPiiService],
})
export class LeadPiiModule {}
