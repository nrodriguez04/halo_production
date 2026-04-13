import { Module } from '@nestjs/common';
import { LeadEnrichmentProcessor } from './lead-enrichment.processor';
import { CommunicationsProcessor } from './communications.processor';
import { UnderwritingProcessor } from './underwriting.processor';
import { MarketingProcessor } from './marketing.processor';

@Module({
  providers: [
    LeadEnrichmentProcessor,
    CommunicationsProcessor,
    UnderwritingProcessor,
    MarketingProcessor,
  ],
})
export class ProcessorsModule {}

