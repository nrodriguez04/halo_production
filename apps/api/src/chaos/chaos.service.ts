import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const CHAOS_KEY = 'halo:chaos';

@Injectable()
export class ChaosService {
  private readonly logger = new Logger(ChaosService.name);
  private redis: IORedis;

  constructor() {
    this.redis = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
  }

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

  async listFailedJobs(queue?: string): Promise<any[]> {
    const queueNames = queue ? [queue] : ['communications', 'lead-enrichment', 'underwriting', 'marketing'];
    const results: any[] = [];

    for (const name of queueNames) {
      try {
        const q = new Queue(name, {
          connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
        });
        const failed = await q.getFailed(0, 50);
        for (const job of failed) {
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

  async replayJob(queueName: string, jobId: string) {
    const q = new Queue(queueName, {
      connection: { host: 'localhost', port: 6379, maxRetriesPerRequest: null },
    });

    try {
      const job = await q.getJob(jobId);
      if (!job) return { success: false, error: 'Job not found' };

      await job.retry();
      this.logger.log(`Replayed job ${jobId} on queue ${queueName}`);
      return { success: true, jobId };
    } finally {
      await q.close();
    }
  }
}
