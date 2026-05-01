import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LeadEnrichmentProcessor } from './lead-enrichment.processor';
import { CommunicationsProcessor } from './communications.processor';
import { UnderwritingProcessor } from './underwriting.processor';
import { MarketingProcessor } from './marketing.processor';
import { VideoProcessor } from './video.processor';

@Module({
  providers: [
    PrismaService,
    LeadEnrichmentProcessor,
    CommunicationsProcessor,
    UnderwritingProcessor,
    MarketingProcessor,
    VideoProcessor,
  ],
  exports: [PrismaService],
})
export class ProcessorsModule {}
