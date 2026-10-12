import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  nextRunAt,
  SourcingService,
  type SourcingCadence,
} from './sourcing.service';

const MIN_TICK_SEC = 30;
const DEFAULT_TICK_SEC = 300;
const BATCH = 20;

/**
 * Runs due markets. A tick every few minutes looks for enabled markets whose
 * `nextRunAt` has passed, claims each one by moving its `nextRunAt` forward
 * in a conditional update (so two API replicas never pull the same market
 * twice), then runs it. Off in tests and when SOURCING_SCHEDULER=off.
 */
@Injectable()
export class SourcingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SourcingSchedulerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private sourcing: SourcingService,
  ) {}

  onModuleInit(): void {
    if (!schedulerEnabled()) {
      this.logger.log('Sourcing scheduler is off');
      return;
    }
    const everyMs = tickSeconds() * 1000;
    this.timer = setInterval(() => void this.tick(), everyMs);
    this.timer.unref?.();
    this.logger.log(`Sourcing scheduler ticking every ${everyMs / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many markets this tick ran. Safe to call concurrently; overlapping ticks are skipped. */
  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const due = await this.prisma.sourcingMarket.findMany({
        where: { enabled: true, nextRunAt: { lte: now } },
        orderBy: { nextRunAt: 'asc' },
        take: BATCH,
      });
      let ran = 0;
      for (const market of due) {
        const claimed = await this.prisma.sourcingMarket.updateMany({
          where: { id: market.id, nextRunAt: market.nextRunAt },
          data: {
            nextRunAt: nextRunAt(market.cadence as SourcingCadence, now),
          },
        });
        if (claimed.count !== 1) continue; // another replica got it
        try {
          await this.sourcing.runMarket(market, 'SCHEDULED');
          ran++;
        } catch (err) {
          this.logger.error(
            `Scheduled pull for market ${market.id} failed: ${(err as Error).message}`,
          );
        }
      }
      return ran;
    } finally {
      this.running = false;
    }
  }
}

export function schedulerEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    (process.env.SOURCING_SCHEDULER ?? 'on').toLowerCase() !== 'off'
  );
}

function tickSeconds(): number {
  const n = Number(process.env.SOURCING_TICK_SEC);
  return Number.isFinite(n) && n >= MIN_TICK_SEC ? n : DEFAULT_TICK_SEC;
}
