import { Inject, Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma.service';
import { REDIS } from '../redis/redis.module';

const CHAOS_KEY = 'halo:chaos';

@Injectable()
export class ChaosService {
  private readonly logger = new Logger(ChaosService.name);

  constructor(
    @Inject(REDIS) private redis: Redis,
    private prisma: PrismaService,
  ) {}

  async simulateTwilio429() {
    await this.redis.hset(CHAOS_KEY, 'twilio', 'rate_limited');
    this.logger.warn('CHAOS: Twilio 429 simulation activated');
    return { activated: true, type: 'twilio-429' };
  }

  async simulateDocusignOutage() {
    await this.redis.hset(CHAOS_KEY, 'docusign', 'outage');
    this.logger.warn('CHAOS: DocuSign outage simulation activated');
    return { activated: true, type: 'docusign-outage' };
  }

  async simulateAttom5xx() {
    await this.redis.hset(CHAOS_KEY, 'attom', 'server_error');
    this.logger.warn('CHAOS: ATTOM 5xx simulation activated');
    return { activated: true, type: 'attom-5xx' };
  }

  async clearAll() {
    await this.redis.del(CHAOS_KEY);
    this.logger.log('CHAOS: All simulations cleared');
    return { cleared: true };
  }

  async getStatus() {
    const flags = await this.redis.hgetall(CHAOS_KEY);
    return {
      active: Object.keys(flags).length > 0,
      simulations: flags,
    };
  }

  async isChaosActive(service: string): Promise<string | null> {
    return this.redis.hget(CHAOS_KEY, service);
  }

  async listFailedJobs(accountId: string, queue?: string): Promise<any[]> {
    const queueNames = queue
      ? [queue]
      : [
          'communications',
          'lead-enrichment',
          'underwriting',
          'marketing',
          'marketing-video',
        ];
    const results: any[] = [];

    for (const name of queueNames) {
      try {
        const q = new Queue(name, {
          connection: this.redis.duplicate(),
        });
        const failed = await q.getFailed(0, 50);
        for (const job of failed) {
          const jobAccountId = await this.resolveJobAccountId(name, job.data);
          if (!jobAccountId || jobAccountId !== accountId) {
            continue;
          }
          results.push({
            id: job.id,
            queue: name,
            name: job.name,
            data: job.data,
            failedReason: job.failedReason,
            attemptsMade: job.attemptsMade,
            timestamp: job.timestamp,
          });
        }
        await q.close();
      } catch {
        // queue may not exist yet
      }
    }

    return results;
  }

  async replayJob(queueName: string, jobId: string, accountId: string) {
    const q = new Queue(queueName, {
      connection: this.redis.duplicate(),
    });

    try {
      const job = await q.getJob(jobId);
      if (!job) return { success: false, error: 'Job not found' };

      const jobAccountId = await this.resolveJobAccountId(queueName, job.data);
      if (!jobAccountId || jobAccountId !== accountId) {
        return { success: false, error: 'Job not found' };
      }

      await job.retry();
      this.logger.log(`Replayed job ${jobId} on queue ${queueName}`);
      return { success: true, jobId };
    } finally {
      await q.close();
    }
  }

  private async resolveJobAccountId(
    queueName: string,
    data: Record<string, unknown> | undefined,
  ): Promise<string | null> {
    switch (queueName) {
      case 'underwriting':
      case 'marketing':
      case 'marketing-video':
        return typeof data?.tenantId === 'string' ? data.tenantId : null;
      case 'communications': {
        const messageId =
          typeof data?.messageId === 'string' ? data.messageId : null;
        if (!messageId) return null;
        const message = await this.prisma.message.findUnique({
          where: { id: messageId },
          select: { accountId: true },
        });
        return message?.accountId ?? null;
      }
      case 'lead-enrichment': {
        const leadId = typeof data?.leadId === 'string' ? data.leadId : null;
        if (!leadId) return null;
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: { accountId: true },
        });
        return lead?.accountId ?? null;
      }
      default:
        return null;
    }
  }
}
