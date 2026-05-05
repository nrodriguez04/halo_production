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
  private marketingVideoQueue: Queue;

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

    // Video gets its own queue so long-running script generation doesn't
    // starve flyer / buyer-blast jobs sharing the marketing concurrency
    // budget. The worker has a dedicated VideoProcessor on this queue.
    this.marketingVideoQueue = new Queue('marketing-video', {
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
    // Route GENERATE_VIDEO_SCRIPT to its dedicated queue so it doesn't
    // share concurrency with the rest of the marketing pipeline.
    const queue = payload.type === 'GENERATE_VIDEO_SCRIPT'
      ? this.marketingVideoQueue
      : this.marketingQueue;
    return queue.add(payload.type, payload);
  }
}
