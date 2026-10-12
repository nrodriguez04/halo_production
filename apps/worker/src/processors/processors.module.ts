import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LeadEnrichmentProcessor } from './lead-enrichment.processor';
import { CommunicationsProcessor } from './communications.processor';
import { UnderwritingProcessor } from './underwriting.processor';
import { MarketingProcessor } from './marketing.processor';
import { VideoProcessor } from './video.processor';
import { AgentsProcessor } from '../agents/agents.processor';

@Module({
  providers: [
    PrismaService,
    LeadEnrichmentProcessor,
    CommunicationsProcessor,
    UnderwritingProcessor,
    MarketingProcessor,
    VideoProcessor,
    AgentsProcessor,
  ],
  exports: [PrismaService],
})
export class ProcessorsModule {}
