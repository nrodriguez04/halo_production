import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

@Injectable()
export class QueueService {
  private redis: Redis;
  private leadEnrichmentQueue: Queue;
  private communicationsQueue: Queue;
  private underwritingQueue: Queue;
  private marketingQueue: Queue;

  constructor() {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      // BullMQ requires this to be null
      maxRetriesPerRequest: null,
    });
    
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

