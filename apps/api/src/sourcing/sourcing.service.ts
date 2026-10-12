import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  AutomationTriggerType,
  Prisma,
  type SourcingMarket,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AutomationService } from '../automation/automation.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { ListingImportService } from '../leads/listing-import.service';
import type {
  ListingSearchCriteria,
  ListingSource,
} from '../integrations/listings/listing-source.types';
import { metroLabel, US_METROS, type Metro } from './sourcing.metros';

export type SourcingCadence = 'daily' | 'weekly' | 'manual';
export const SOURCING_CADENCES = ['daily', 'weekly', 'manual'] as const;

/** Per-market filters, stored as JSON; the same vocabulary as the import route. */
export interface MarketCriteria {
  status?: string[];
  minPrice?: number;
  maxPrice?: number;
  minDaysOnMarket?: number;
  transferredWithinDays?: number;
  propertyType?: string;
  limit?: number;
}

export interface MarketInput {
  label?: string;
  state: string;
  city?: string;
  postalCode?: string;
  sources: ListingSource[];
  criteria?: MarketCriteria;
  cadence?: SourcingCadence;
  enabled?: boolean;
}

export interface MetrosInput {
  count: number;
  sources: ListingSource[];
  criteria?: MarketCriteria;
  cadence?: SourcingCadence;
}

export interface MarketSourceOutcome {
  source: ListingSource;
  ok: boolean;
  searched?: number;
  created?: number;
  duplicates?: number;
  error?: string;
}

export interface MarketRunResult {
  marketId: string;
  label: string;
  ranAt: string;
  trigger: 'SCHEDULED' | 'UI' | 'MANUAL';
  /** Set when the control plane kill switch stopped the pull. */
  skipped?: string;
  outcomes: MarketSourceOutcome[];
  created: number;
}

export const SYSTEM_USER_ID = 'system';
const DEFAULT_LIMIT = 50;

/**
 * Markets are the standing "find" instruction: an area, the sources to pull
 * from, the filters, and how often. A run imports every source through the
 * same path as a manual Leads > Import, so dedupe, provenance and tags are
 * identical, and is recorded as an AutomationRun (source `sourcing`) so it
 * shows up on the Automation page with its cost.
 */
@Injectable()
export class SourcingService {
  private readonly logger = new Logger(SourcingService.name);

  constructor(
    private prisma: PrismaService,
    private listingImport: ListingImportService,
    private automation: AutomationService,
    private controlPlane: ControlPlaneService,
  ) {}

  list(accountId: string): Promise<SourcingMarket[]> {
    return this.prisma.sourcingMarket.findMany({
      where: { accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  metros(): readonly Metro[] {
    return US_METROS;
  }

  async create(accountId: string, input: MarketInput): Promise<SourcingMarket> {
    const cadence = input.cadence ?? 'daily';
    const enabled = input.enabled ?? true;
    return this.prisma.sourcingMarket.create({
      data: {
        accountId,
        label: input.label?.trim() || defaultLabel(input),
        state: input.state.trim().toUpperCase(),
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        sources: Array.from(new Set(input.sources)),
        criteria: (input.criteria ?? {}) as Prisma.InputJsonObject,
        cadence,
        enabled,
        nextRunAt: enabled ? nextRunAt(cadence, new Date()) : null,
      },
    });
  }

  /** One-click nationwide coverage: the N largest cities not already set up. */
  async createMetros(
    accountId: string,
    input: MetrosInput,
  ): Promise<{ created: SourcingMarket[]; skipped: string[] }> {
    const existing = new Set(
      (await this.list(accountId)).map((m) => m.label.toLowerCase()),
    );
    const created: SourcingMarket[] = [];
    const skipped: string[] = [];
    for (const metro of US_METROS.slice(0, input.count)) {
      const label = metroLabel(metro);
      if (existing.has(label.toLowerCase())) {
        skipped.push(label);
        continue;
      }
      created.push(
        await this.create(accountId, {
          label,
          state: metro.state,
          city: metro.city,
          sources: input.sources,
          criteria: input.criteria,
          cadence: input.cadence,
        }),
      );
    }
    return { created, skipped };
  }

  async update(
    accountId: string,
    id: string,
    patch: Partial<MarketInput>,
  ): Promise<SourcingMarket> {
    const market = await this.get(accountId, id);
    const cadence = patch.cadence ?? (market.cadence as SourcingCadence);
    const enabled = patch.enabled ?? market.enabled;
    const scheduleChanged =
      patch.cadence !== undefined || patch.enabled !== undefined;
    return this.prisma.sourcingMarket.update({
      where: { id },
      data: {
        ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
        ...(patch.state !== undefined
          ? { state: patch.state.trim().toUpperCase() }
          : {}),
        ...(patch.city !== undefined
          ? { city: patch.city?.trim() || null }
          : {}),
        ...(patch.postalCode !== undefined
          ? { postalCode: patch.postalCode?.trim() || null }
          : {}),
        ...(patch.sources !== undefined
          ? { sources: Array.from(new Set(patch.sources)) }
          : {}),
        ...(patch.criteria !== undefined
          ? { criteria: patch.criteria as Prisma.InputJsonObject }
          : {}),
        cadence,
        enabled,
        ...(scheduleChanged
          ? { nextRunAt: enabled ? nextRunAt(cadence, new Date()) : null }
          : {}),
      },
    });
  }

  async remove(accountId: string, id: string): Promise<void> {
    await this.get(accountId, id);
    await this.prisma.sourcingMarket.delete({ where: { id } });
  }

  async runNow(
    accountId: string,
    id: string,
    userId: string,
  ): Promise<MarketRunResult> {
    const market = await this.get(accountId, id);
    return this.runMarket(market, 'UI', userId);
  }

  /**
   * Pull every source for one market. A source that fails (not configured,
   * rejected key, vendor down) is recorded in the outcome and does not stop
   * the others; the market's next run is scheduled either way.
   */
  async runMarket(
    market: SourcingMarket,
    trigger: MarketRunResult['trigger'],
    userId: string = SYSTEM_USER_ID,
  ): Promise<MarketRunResult> {
    const now = new Date();
    const base: MarketRunResult = {
      marketId: market.id,
      label: market.label,
      ranAt: now.toISOString(),
      trigger,
      outcomes: [],
      created: 0,
    };

    if (!(await this.controlPlane.isEnabled(market.accountId))) {
      const result = { ...base, skipped: 'control plane disabled' };
      await this.finishMarket(market, now, result);
      return result;
    }

    const runId = await this.openRun(market, trigger);
    const criteria = toCriteria(market);
    for (const source of market.sources as ListingSource[]) {
      try {
        const r = await this.listingImport.importListings(
          source,
          criteria,
          market.accountId,
          userId,
        );
        base.outcomes.push({
          source,
          ok: true,
          searched: r.searched,
          created: r.created,
          duplicates: r.duplicates,
        });
      } catch (err) {
        base.outcomes.push({ source, ok: false, error: errorMessage(err) });
      }
    }
    base.created = base.outcomes.reduce((s, o) => s + (o.created ?? 0), 0);

    await this.finishMarket(market, now, base);
    await this.closeRun(runId, market.accountId, base);
    this.logger.log(
      `Market "${market.label}" (${trigger}): ${base.created} new leads from ${base.outcomes.length} source(s)`,
    );
    return base;
  }

  /** Latest sourcing runs for the Markets page, newest first. */
  recentRuns(accountId: string, limit = 20) {
    return this.prisma.automationRun.findMany({
      where: { tenantId: accountId, source: 'sourcing' },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        entityId: true,
        status: true,
        triggerType: true,
        startedAt: true,
        completedAt: true,
        outputJson: true,
        errorJson: true,
        createdAt: true,
      },
    });
  }

  private async get(accountId: string, id: string): Promise<SourcingMarket> {
    const market = await this.prisma.sourcingMarket.findFirst({
      where: { id, accountId },
    });
    if (!market) throw new NotFoundException('Market not found');
    return market;
  }

  private async finishMarket(
    market: SourcingMarket,
    now: Date,
    result: MarketRunResult,
  ): Promise<void> {
    await this.prisma.sourcingMarket.update({
      where: { id: market.id },
      data: {
        lastRunAt: now,
        lastResult: result as unknown as Prisma.InputJsonObject,
        nextRunAt: market.enabled
          ? nextRunAt(market.cadence as SourcingCadence, now)
          : null,
      },
    });
  }

  private async openRun(
    market: SourcingMarket,
    trigger: MarketRunResult['trigger'],
  ): Promise<string | null> {
    try {
      const run = await this.automation.createRun({
        tenantId: market.accountId,
        source: 'sourcing',
        workflowName: 'market_pull',
        entityType: 'sourcing_market',
        entityId: market.id,
        triggerType: AutomationTriggerType[trigger],
        inputJson: {
          label: market.label,
          state: market.state,
          city: market.city,
          postalCode: market.postalCode,
          sources: market.sources,
          criteria: market.criteria,
        },
      });
      await this.automation.startRun(run.id, market.accountId);
      return run.id;
    } catch (err) {
      this.logger.warn(
        `Could not open an automation run for market ${market.id}: ${(err as Error).message}`,
      );
      return null;
    }
  }

  private async closeRun(
    runId: string | null,
    accountId: string,
    result: MarketRunResult,
  ): Promise<void> {
    if (!runId) return;
    const allFailed =
      result.outcomes.length > 0 && result.outcomes.every((o) => !o.ok);
    try {
      if (allFailed) {
        await this.automation.failRun(runId, accountId, {
          outcomes: result.outcomes,
        });
      } else {
        await this.automation.completeRun(runId, accountId, {
          outputJson: result,
        });
      }
    } catch (err) {
      this.logger.warn(
        `Could not close automation run ${runId}: ${(err as Error).message}`,
      );
    }
  }
}

/** The market's area plus its stored filters, in the import route's shape. */
export function toCriteria(market: SourcingMarket): ListingSearchCriteria {
  const stored = (market.criteria ?? {}) as MarketCriteria;
  return {
    state: market.state,
    city: market.city ?? undefined,
    postalCode: market.postalCode ?? undefined,
    status: stored.status,
    minPrice: stored.minPrice,
    maxPrice: stored.maxPrice,
    minDaysOnMarket: stored.minDaysOnMarket,
    transferredWithinDays: stored.transferredWithinDays,
    propertyType: stored.propertyType,
    limit: stored.limit ?? DEFAULT_LIMIT,
  };
}

/**
 * Daily markets run at SOURCING_RUN_HOUR_UTC (default 06:00 UTC, overnight
 * in the US); weekly ones on Mondays at that hour; manual ones never.
 */
export function nextRunAt(
  cadence: SourcingCadence,
  from: Date,
  runHourUtc = runHour(),
): Date | null {
  if (cadence === 'manual') return null;
  const next = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate(),
      runHourUtc,
      0,
      0,
      0,
    ),
  );
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  if (cadence === 'weekly') {
    while (next.getUTCDay() !== 1) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

function runHour(): number {
  const n = Number(process.env.SOURCING_RUN_HOUR_UTC);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 6;
}

function defaultLabel(input: MarketInput): string {
  const area = input.city?.trim() || input.postalCode?.trim() || 'Market';
  return `${area}, ${input.state.trim().toUpperCase()}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof HttpException) {
    const body = err.getResponse();
    if (typeof body === 'string') return body;
    const message = (body as { message?: unknown }).message;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return (err as Error).message ?? String(err);
}
