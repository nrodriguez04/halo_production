import { Inject, Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { REDIS } from '../redis/redis.module';
import { agentJobId, type AgentJobPayload } from '@halo/shared';

@Injectable()
export class QueueService {
  private leadEnrichmentQueue: Queue;
  private communicationsQueue: Queue;
  private underwritingQueue: Queue;
  private marketingQueue: Queue;
  private marketingVideoQueue: Queue;
  private agentsQueue: Queue;

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

    // One queue for every agent; the worker dispatches on payload.agent.
    this.agentsQueue = new Queue('agents', { connection: this.redis });
  }

  /** Queue an agent run. The job id makes the same (agent, entity, trigger event) idempotent. */
  async enqueueAgent(payload: AgentJobPayload) {
    return this.agentsQueue.add(payload.agent, payload, {
      jobId: agentJobId(payload),
      removeOnComplete: 500,
      removeOnFail: 200,
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
    type:
      | 'GENERATE_FLYER_DRAFT'
      | 'GENERATE_BUYER_BLAST_DRAFT'
      | 'GENERATE_VIDEO_SCRIPT';
    buyerIds?: string[];
    actorId?: string | null;
  }) {
    // Route GENERATE_VIDEO_SCRIPT to its dedicated queue so it doesn't
    // share concurrency with the rest of the marketing pipeline.
    const queue =
      payload.type === 'GENERATE_VIDEO_SCRIPT'
        ? this.marketingVideoQueue
        : this.marketingQueue;
    return queue.add(payload.type, payload);
  }

  /**
   * Jobs that landed in a failed set after `sinceMs`, per queue. BullMQ only
   * moves a job there once its retries are used up.
   */
  async failedJobsSince(sinceMs: number): Promise<
    Record<
      string,
      Array<{
        id: string;
        name: string;
        failedReason: string | null;
        finishedOn: number | null;
      }>
    >
  > {
    const queues: Record<string, Queue> = {
      'lead-enrichment': this.leadEnrichmentQueue,
      communications: this.communicationsQueue,
      underwriting: this.underwritingQueue,
      marketing: this.marketingQueue,
      'marketing-video': this.marketingVideoQueue,
      agents: this.agentsQueue,
    };
    const out: Record<
      string,
      Array<{
        id: string;
        name: string;
        failedReason: string | null;
        finishedOn: number | null;
      }>
    > = {};
    for (const [name, queue] of Object.entries(queues)) {
      const failed = await queue.getFailed(0, 50);
      out[name] = failed
        .filter((j) => (j.finishedOn ?? j.timestamp ?? 0) > sinceMs)
        .map((j) => ({
          id: String(j.id),
          name: j.name,
          failedReason: j.failedReason ?? null,
          finishedOn: j.finishedOn ?? null,
        }));
    }
    return out;
  }
}
