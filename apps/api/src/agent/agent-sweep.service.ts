import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { AgentOrchestrationService } from './agent-orchestration.service';

const TICK_MS = 10 * 60 * 1000;
const DEFAULT_HOUR_UTC = 7;

/**
 * The nightly sweep (design doc s4): once a day, after the sourcing pulls,
 * leads that have sat in `enriched` without a deal are re-queued for the
 * Lead Analyst. Duplicate protection is the job id, which carries the date,
 * so several api replicas can all tick. Off under test or AGENT_SWEEP=off.
 */
@Injectable()
export class AgentSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastSweepDay: string | null = null;

  constructor(private orchestration: AgentOrchestrationService) {}

  onModuleInit(): void {
    if (!sweepEnabled()) {
      this.logger.log('Agent sweep is off');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    this.logger.log(`Agent sweep armed for ${sweepHourUtc()}:00 UTC daily`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs the sweep once per UTC day, at or after the configured hour. */
  async tick(now = new Date()): Promise<number> {
    const day = now.toISOString().slice(0, 10);
    if (this.lastSweepDay === day || now.getUTCHours() < sweepHourUtc()) {
      return 0;
    }
    this.lastSweepDay = day;
    try {
      const queued = await this.orchestration.sweep(now);
      if (queued > 0) {
        this.logger.log(`Agent sweep queued ${queued} stale lead(s)`);
      }
      return queued;
    } catch (err) {
      this.logger.error(`Agent sweep failed: ${(err as Error).message}`);
      return 0;
    }
  }
}

export function sweepEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    (process.env.AGENT_SWEEP ?? 'on').toLowerCase() !== 'off'
  );
}

export function sweepHourUtc(): number {
  const n = Number(process.env.AGENT_SWEEP_HOUR_UTC);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_HOUR_UTC;
}
