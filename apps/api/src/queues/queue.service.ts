import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';

@Injectable()
export class QueueService {
  private leadEnrichmentQueue: Queue;
  private communicationsQueue: Queue;
  private underwritingQueue: Queue;
  private marketingQueue: Queue;

  constructor(@Inject(REDIS) private redis: Redis) {
    this.leadEnrichmentQueue = new Queue('lead-enrichment', {
      connection: this.redis,
    });

    this.communicationsQueue = new Queue('communications', {
      connection: this.redis,
    });

    this.underwritingQueue = new Queue('underwriting', {
      connection: this.redis,
    });

    this.marketingQueue = new Queue('marketing', {
      connection: this.redis,
    });
  }

  async enqueueLeadEnrichment(leadId: string) {
    return this.leadEnrichmentQueue.add('enrich', { leadId });
  }

  async enqueueCommunication(messageId: string) {
    return this.communicationsQueue.add('send', { messageId });
  }

  async enqueueUnderwriting(payload: {
    jobRunId: string;
    tenantId: string;
    dealId: string;
    actorId?: string | null;
  }) {
    return this.underwritingQueue.add('UNDERWRITE_DEAL', payload);
  }

  async enqueueMarketing(payload: {
    jobRunId: string;
    tenantId: string;
    dealId: string;
    type: 'GENERATE_FLYER_DRAFT' | 'GENERATE_BUYER_BLAST_DRAFT' | 'GENERATE_VIDEO_SCRIPT';
    buyerIds?: string[];
    actorId?: string | null;
  }) {
    return this.marketingQueue.add(payload.type, payload);
  }
}
