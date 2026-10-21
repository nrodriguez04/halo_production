import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OpsAlertService } from '../alerts/ops-alert.service';
import { CampaignsService } from './campaigns.service';
import { OffersService } from './offers.service';
import { ClosingService } from './closing.service';
import { dealEvent } from './timeline-events';
import { TimelineService } from '../timeline/timeline.service';

const TICK_MS = 60 * 60 * 1000;
const DEFAULT_HOUR_UTC = 13;

/**
 * The Transaction Coordinator's clock (docs/contract-flipping.md s6).
 * Hourly: campaigns stop when their contract can no longer be marketed,
 * stale offers expire, and closing files with overdue or blocked items
 * raise an alert and a timeline note once a day each. Daily, at
 * DISPOSITION_SWEEP_HOUR_UTC: follow-up drafts for buyers who have not
 * answered. Deterministic; no model is involved. Off under test or with
 * DISPOSITION_SWEEP=off.
 */
@Injectable()
export class DispositionSweepService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispositionSweepService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastFollowUpDay: string | null = null;
  /** Alert fingerprints already raised today, so an hourly tick does not repeat them. */
  private alerted = new Set<string>();
  private alertedDay: string | null = null;

  constructor(
    private prisma: PrismaService,
    private alerts: OpsAlertService,
    private timeline: TimelineService,
    private campaigns: CampaignsService,
    private offers: OffersService,
    private closing: ClosingService,
  ) {}

  onModuleInit(): void {
    if (!dispositionSweepEnabled()) {
      this.logger.log('Disposition sweep is off');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(now = new Date()) {
    const out = {
      campaignsExpired: 0,
      offersExpired: 0,
      followUps: 0,
      closingAlerts: 0,
    };
    try {
      out.campaignsExpired = await this.campaigns.expireCampaigns(now);
      out.offersExpired = await this.offers.expireStale(now);
      out.closingAlerts = await this.closingAlerts(now);
      const day = now.toISOString().slice(0, 10);
      if (this.lastFollowUpDay !== day && now.getUTCHours() >= sweepHourUtc()) {
        this.lastFollowUpDay = day;
        out.followUps = await this.campaigns.queueFollowUps(now);
      }
    } catch (err) {
      this.logger.error(`Disposition sweep failed: ${(err as Error).message}`);
    }
    if (Object.values(out).some((n) => n > 0)) {
      this.logger.log(`Disposition sweep: ${JSON.stringify(out)}`);
    }
    return out;
  }

  /** Overdue milestones, blocking issues and passing deadlines on open closing files. */
  async closingAlerts(now = new Date()) {
    const day = now.toISOString().slice(0, 10);
    if (this.alertedDay !== day) {
      this.alerted.clear();
      this.alertedDay = day;
    }
    const files = await this.prisma.closingFile.findMany({
      where: { status: { in: ['open', 'clear_to_close'] } },
      select: {
        accountId: true,
        dealId: true,
        deal: {
          select: { stage: true, property: { select: { address: true } } },
        },
      },
      take: 500,
    });
    let raised = 0;
    for (const f of files) {
      if (['lost', 'closed'].includes(f.deal.stage)) continue;
      const file = await this.closing.get(f.accountId, f.dealId, now);
      if (!file) continue;
      const urgent = file.readiness.attention.filter(
        (a) => a.level === 'overdue' || a.level === 'blocked',
      );
      for (const item of urgent) {
        const key = `${f.dealId}:${item.text}`;
        if (this.alerted.has(key)) continue;
        this.alerted.add(key);
        raised += 1;
        await dealEvent(
          this.timeline,
          f.accountId,
          f.dealId,
          'CLOSING_ATTENTION',
          {
            level: item.level,
            text: item.text,
          },
          null,
        );
        await this.alerts.send({
          title: `Closing needs attention: ${f.deal.property?.address ?? f.dealId}`,
          lines: [item.text],
          severity: item.level === 'blocked' ? 'critical' : 'warning',
          fingerprint: `closing:${key}:${day}`,
        });
      }
    }
    return raised;
  }
}

export function dispositionSweepEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    (process.env.DISPOSITION_SWEEP ?? 'on').toLowerCase() !== 'off'
  );
}

function sweepHourUtc(): number {
  const n = Number(process.env.DISPOSITION_SWEEP_HOUR_UTC);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : DEFAULT_HOUR_UTC;
}
