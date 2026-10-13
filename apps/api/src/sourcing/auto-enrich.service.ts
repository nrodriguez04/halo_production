import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  ControlPlaneService,
  GLOBAL_ACCOUNT_ID,
} from '../control-plane/control-plane.service';
import { LeadLifecycleService } from '../lead-lifecycle/lead-lifecycle.service';

const TICK_MS = 10 * 60 * 1000;
const CANDIDATE_POOL = 500;
const UNATTRIBUTED_ACCOUNT_ID = 'unknown';

export interface AutoEnrichStatus {
  enabled: boolean;
  dailyCap: number;
  usedToday: number;
  remainingToday: number;
  waiting: number;
  /** Why nothing runs for this tenant, when nothing does. */
  blockedBy?: 'control_plane' | 'external_data' | 'disabled' | null;
}

export interface AutoEnrichResult {
  queued: number;
  leadIds: string[];
  status: AutoEnrichStatus;
}

const DISTRESS = new Set([
  'tax:delinquent',
  'tax-lien',
  'tax_lien',
  'foreclosure',
  'pre-foreclosure',
  'preforeclosure',
  'lien',
  'distressed_sale',
  'probate',
  'vacant',
]);
const LISTING = new Set([
  'stale_listing',
  'listing:expired',
  'listing:withdrawn',
  'listing:canceled',
  'listing:cancelled',
]);
const ABSENTEE = new Set(['owner:absentee', 'absentee', 'owner:out_of_state']);

/**
 * Which new leads are worth paying to enrich first: distress and listing
 * signals over plain records, newest first within a tier.
 */
export function enrichmentPriority(tags: string[]): number {
  const t = new Set(tags.map((x) => x.toLowerCase()));
  let score = 0;
  if ([...t].some((x) => DISTRESS.has(x))) score += 3;
  if ([...t].some((x) => LISTING.has(x))) score += 2;
  if ([...t].some((x) => ABSENTEE.has(x))) score += 2;
  if (t.has('motivated')) score += 1;
  if (t.has('owner:occupied') && score === 0) score -= 1;
  return score;
}

export function rankForEnrichment<
  T extends { id: string; tags: string[]; createdAt: Date },
>(leads: T[]): T[] {
  return [...leads].sort((a, b) => {
    const diff = enrichmentPriority(b.tags) - enrichmentPriority(a.tags);
    if (diff !== 0) return diff;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export function startOfUtcDay(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/**
 * Sourced and imported leads arrive as `new` and used to wait for a person
 * to start enrichment. This moves up to the tenant's daily cap of them to
 * `enriching` (which queues the enrichment job) every ten minutes, best
 * signals first. Enrichment is paid (property lookup, geocoding, and later
 * skip trace), so the cap and the switch live on the control plane, and the
 * cost-governance budgets still apply to every call. Off under test or with
 * AUTO_ENRICH=off.
 */
@Injectable()
export class AutoEnrichService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutoEnrichService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private lifecycle: LeadLifecycleService,
  ) {}

  onModuleInit(): void {
    if (!autoEnrichSchedulerEnabled()) {
      this.logger.log('Auto-enrich scheduler is off');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    this.timer.unref?.();
    this.logger.log(`Auto-enrich ticking every ${TICK_MS / 1000}s`);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass over every tenant with new leads waiting. */
  async tick(now = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const tenants = await this.prisma.lead.findMany({
        where: { status: 'new' },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 200,
      });
      let queued = 0;
      for (const { accountId } of tenants) {
        if (
          !accountId ||
          accountId === UNATTRIBUTED_ACCOUNT_ID ||
          accountId === GLOBAL_ACCOUNT_ID
        ) {
          continue;
        }
        try {
          queued += (await this.runForAccount(accountId, now)).queued;
        } catch (err) {
          this.logger.warn(
            `Auto-enrich failed for ${accountId}: ${(err as Error).message}`,
          );
        }
      }
      if (queued > 0) this.logger.log(`Auto-enrich queued ${queued} lead(s)`);
      return queued;
    } finally {
      this.running = false;
    }
  }

  async status(accountId: string, now = new Date()): Promise<AutoEnrichStatus> {
    const cp = await this.controlPlane.getStatus(accountId, {
      provision: false,
    });
    const [usedToday, waiting] = await Promise.all([
      this.usedToday(accountId, now),
      this.prisma.lead.count({ where: { accountId, status: 'new' } }),
    ]);
    const cap = Math.max(0, cp.autoEnrichDailyCap ?? 0);
    const blockedBy = !cp.enabled
      ? 'control_plane'
      : !cp.externalDataEnabled
        ? 'external_data'
        : !cp.autoEnrichEnabled || cap === 0
          ? 'disabled'
          : null;
    return {
      enabled: !!cp.autoEnrichEnabled,
      dailyCap: cap,
      usedToday,
      remainingToday: Math.max(0, cap - usedToday),
      waiting,
      blockedBy,
    };
  }

  /** Moves up to the remaining daily allowance of this tenant's best new leads to enriching. */
  async runForAccount(
    accountId: string,
    now = new Date(),
  ): Promise<AutoEnrichResult> {
    const status = await this.status(accountId, now);
    if (status.blockedBy || status.remainingToday <= 0) {
      return { queued: 0, leadIds: [], status };
    }
    const candidates = await this.prisma.lead.findMany({
      where: {
        accountId,
        status: 'new',
        canonicalAddress: { not: null },
        canonicalZip: { not: null },
      },
      select: {
        id: true,
        tags: true,
        createdAt: true,
        canonicalAddress: true,
        canonicalZip: true,
      },
      orderBy: { createdAt: 'desc' },
      take: CANDIDATE_POOL,
    });
    const usable = candidates.filter(
      (l) => l.canonicalAddress?.trim() && l.canonicalZip?.trim(),
    );
    const picked = rankForEnrichment(usable).slice(0, status.remainingToday);
    const leadIds: string[] = [];
    for (const lead of picked) {
      try {
        await this.lifecycle.transition({
          leadId: lead.id,
          accountId,
          next: 'enriching',
          actorType: 'system',
          reason: `Auto-enrich (daily cap ${status.dailyCap})`,
          metadata: { autoEnrich: true },
        });
        leadIds.push(lead.id);
      } catch (err) {
        // Another replica or a person got there first; the lead is no
        // longer `new`, which is fine.
        this.logger.debug?.(
          `Lead ${lead.id} not auto-enriched: ${(err as Error).message}`,
        );
      }
    }
    return {
      queued: leadIds.length,
      leadIds,
      status: {
        ...status,
        usedToday: status.usedToday + leadIds.length,
        remainingToday: Math.max(0, status.remainingToday - leadIds.length),
        waiting: Math.max(0, status.waiting - leadIds.length),
      },
    };
  }

  /** Auto-enrich transitions today, from the lead timeline (indexed on tenant, type, time). */
  private usedToday(accountId: string, now: Date): Promise<number> {
    return this.prisma.timelineEvent.count({
      where: {
        tenantId: accountId,
        eventType: 'lead.status.enriching',
        createdAt: { gte: startOfUtcDay(now) },
        payloadJson: { path: ['autoEnrich'], equals: true },
      },
    });
  }
}

export function autoEnrichSchedulerEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'test' &&
    (process.env.AUTO_ENRICH ?? 'on').toLowerCase() !== 'off'
  );
}
