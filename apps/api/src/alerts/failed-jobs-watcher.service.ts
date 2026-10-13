import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { QueueService } from '../queues/queue.service';
import { OpsAlertService } from './ops-alert.service';

const TICK_MS = 5 * 60 * 1000;

/**
 * BullMQ moves a job to its failed set only after its retries are used up,
 * so anything new there is a real failure: an enrichment that keeps
 * erroring, a send the provider refuses, an agent job that crashed. Every
 * five minutes this alerts on jobs that failed since the last look, one
 * alert per queue, with the first few reasons. Off under test or with
 * FAILED_JOBS_WATCH=off.
 */
@Injectable()
export class FailedJobsWatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FailedJobsWatcherService.name);
  private timer: NodeJS.Timeout | null = null;
  private since = Date.now();

  constructor(
    private queues: QueueService,
    private alerts: OpsAlertService,
  ) {}

  onModuleInit(): void {
    if (!failedJobsWatchEnabled()) return;
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = Date.now()): Promise<number> {
    const from = this.since;
    this.since = now;
    let alerted = 0;
    try {
      const byQueue = await this.queues.failedJobsSince(from);
      for (const [queue, jobs] of Object.entries(byQueue)) {
        if (jobs.length === 0) continue;
        alerted += jobs.length;
        await this.alerts.send({
          title: `${jobs.length} job(s) failed on the ${queue} queue`,
          severity: 'warning',
          fingerprint: `jobs:${queue}:${jobs[0]?.failedReason?.slice(0, 80) ?? ''}`,
          lines: [
            ...jobs
              .slice(0, 3)
              .map(
                (j) =>
                  `- ${j.name} ${j.id}: ${(j.failedReason ?? 'no reason').slice(0, 200)}`,
              ),
            'Replay or inspect them on Admin > Chaos & DLQ.',
          ],
        });
      }
    } catch (err) {
      this.logger.warn(`Failed-jobs check failed: ${(err as Error).message}`);
    }
    return alerted;
  }
}

export function failedJobsWatchEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    (process.env.FAILED_JOBS_WATCH ?? 'on').toLowerCase() !== 'off'
  );
}
