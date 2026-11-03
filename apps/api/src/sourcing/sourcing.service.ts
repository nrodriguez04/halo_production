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
import {
  ACTIVITY_LABEL,
  ASSET_CLASS_LABEL,
  SOURCING_COVERAGE,
  type AssetClass,
  type CommercialCriteria,
  type LandCriteria,
} from '@halo/shared';
import { MarketsService } from '../markets/markets.service';

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
  /** Land filters, when the market sources land (docs/asset-classes.md s3). */
  land?: LandCriteria;
  /** Commercial filters, when the market sources commercial property. */
  commercial?: CommercialCriteria;
}

export interface MarketInput {
  label?: string;
  state: string;
  city?: string;
  postalCode?: string;
  sources: ListingSource[];
  /** What the market looks for; residential when omitted. */
  assetClasses?: AssetClass[];
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
  filtered?: number;
  filteredReasons?: Record<string, number>;
  unclassified?: number;
  byClass?: Partial<Record<AssetClass, number>>;
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
  /** Set when a person ran a small batch with a lower limit than the market's. */
  batchLimit?: number;
}

export const SYSTEM_USER_ID = 'system';
const DEFAULT_LIMIT = 50;
/** The largest "try a small batch" run a person can ask for. */
export const MAX_BATCH = 25;
/** Realie pages per import (realie-leads.adapter MAX_PAGES); the most one source can bill a run. */
const MAX_PAGES_PER_SOURCE: Record<ListingSource, number> = {
  realie: 5,
  rentcast: 1,
  mls: 1,
};

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
    private markets: MarketsService,
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
    const assetClasses = assetClassesOf(input.assetClasses);
    // A land or commercial market starts manual: run a small batch, check
    // what came back, then turn the schedule on.
    const cadence =
      input.cadence ??
      (assetClasses.some((c) => c !== 'residential') ? 'manual' : 'daily');
    const enabled = input.enabled ?? true;
    return this.prisma.sourcingMarket.create({
      data: {
        accountId,
        label: input.label?.trim() || defaultLabel(input, assetClasses),
        state: input.state.trim().toUpperCase(),
        city: input.city?.trim() || null,
        postalCode: input.postalCode?.trim() || null,
        sources: Array.from(new Set(input.sources)),
        assetClasses,
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
        ...(patch.assetClasses !== undefined
          ? { assetClasses: assetClassesOf(patch.assetClasses) }
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

  /**
   * Pull this market now. `limit` runs a small batch (at most MAX_BATCH
   * records per source) without changing the market's own filters.
   */
  async runNow(
    accountId: string,
    id: string,
    userId: string,
    opts: { limit?: number } = {},
  ): Promise<MarketRunResult> {
    const market = await this.get(accountId, id);
    const limit =
      opts.limit != null
        ? Math.max(1, Math.min(MAX_BATCH, Math.round(opts.limit)))
        : undefined;
    return this.runMarket(market, 'UI', userId, limit);
  }

  /**
   * What a run could cost and what the sources can see, before anything is
   * pulled: the most pages each source can bill at the rate card, what is
   * filtered by the provider and what by Halo, and where the state stands.
   */
  async estimate(
    accountId: string,
    input: {
      state: string;
      sources: ListingSource[];
      assetClasses?: AssetClass[];
      cadence?: SourcingCadence;
      limit?: number;
    },
  ) {
    const classes = assetClassesOf(input.assetClasses);
    const rules = await this.prisma.providerPricingRule.findMany({
      where: {
        provider: { key: { in: input.sources } },
        action: { in: ['search_properties', 'search_listings'] },
      },
      include: { provider: { select: { key: true } } },
    });
    const perSource = input.sources.map((source) => {
      const rule = rules.find((r) => r.provider.key === source);
      const unit = rule?.unitCostUsd ?? 0;
      const filteredByHalo = classes.some((c) => c !== 'residential');
      // A filtered Realie pull reads full pages, up to its page cap.
      const pages =
        source === 'realie'
          ? filteredByHalo
            ? MAX_PAGES_PER_SOURCE.realie
            : Math.min(
                MAX_PAGES_PER_SOURCE.realie,
                Math.ceil((input.limit ?? DEFAULT_LIMIT) / 100),
              )
          : MAX_PAGES_PER_SOURCE[source];
      return {
        source,
        maxCallsPerRun: pages,
        unitCostUsd: unit,
        maxUsdPerRun: Math.round(pages * unit * 100) / 100,
        note:
          source === 'realie'
            ? 'One token per page of up to 100 parcels; a search with no results is free. Repeating a pull within 12 hours is served from cache.'
            : source === 'rentcast'
              ? 'One request per page; listings only (no unlisted parcels).'
              : 'Your MLS feed; $0 unless the vendor charges.',
      };
    });
    const maxUsdPerRun =
      Math.round(perSource.reduce((s, p) => s + p.maxUsdPerRun, 0) * 100) / 100;
    const runsPerMonth =
      input.cadence === 'daily' ? 30 : input.cadence === 'weekly' ? 4.3 : 0;
    const status = await this.stateStatus(accountId, input.state, classes);
    return {
      perSource,
      maxUsdPerRun,
      runsPerMonth,
      maxUsdPerMonth: Math.round(maxUsdPerRun * runsPerMonth * 100) / 100,
      coverage: SOURCING_COVERAGE.filter((row) =>
        row.assetClasses.some((c) => classes.includes(c)),
      ).map((row) => ({
        ...row,
        support: Object.fromEntries(
          input.sources
            .filter((s) => s !== 'mls')
            .map((s) => [s, row[s as 'realie' | 'rentcast']]),
        ),
      })),
      status,
    };
  }

  /**
   * Where the state stands for each asset class: sourcing and analysis are
   * research and always allowed; contacting sellers and everything after it
   * needs the market opened.
   */
  async stateStatus(accountId: string, state: string, classes: AssetClass[]) {
    const out = [];
    for (const assetClass of classes) {
      try {
        const r = await this.markets.evaluate(accountId, state.toUpperCase(), {
          assetClass,
        });
        if (!r) throw new Error(`${state} is not a jurisdiction Halo knows`);
        const e = r.evaluation;
        const outreach = e.activities.seller_outreach;
        out.push({
          assetClass,
          label: ASSET_CLASS_LABEL[assetClass],
          effectiveStatus: e.effectiveStatus,
          researchOnly: !outreach.allowed,
          sellerOutreach: outreach,
          summary: outreach.allowed
            ? `${ACTIVITY_LABEL.seller_outreach} is allowed for ${ASSET_CLASS_LABEL[assetClass].toLowerCase()} in ${state.toUpperCase()}.`
            : `Research only for ${ASSET_CLASS_LABEL[assetClass].toLowerCase()} in ${state.toUpperCase()}: Halo can find and analyze properties, but not contact sellers. ${outreach.reason}`,
          nationwide: !!e.nationwide,
        });
      } catch (err) {
        out.push({
          assetClass,
          label: ASSET_CLASS_LABEL[assetClass],
          effectiveStatus: null,
          researchOnly: true,
          sellerOutreach: { allowed: false, reason: (err as Error).message },
          summary: `Research only: ${(err as Error).message}`,
          nationwide: false,
        });
      }
    }
    return out;
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
    batchLimit?: number,
  ): Promise<MarketRunResult> {
    const now = new Date();
    const base: MarketRunResult = {
      marketId: market.id,
      label: market.label,
      ranAt: now.toISOString(),
      trigger,
      outcomes: [],
      created: 0,
      ...(batchLimit ? { batchLimit } : {}),
    };

    if (!(await this.controlPlane.isEnabled(market.accountId))) {
      const result = { ...base, skipped: 'control plane disabled' };
      await this.finishMarket(market, now, result);
      return result;
    }

    const runId = await this.openRun(market, trigger);
    const criteria = toCriteria(market);
    if (batchLimit)
      criteria.limit = Math.min(criteria.limit ?? batchLimit, batchLimit);
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
          ...(r.filtered != null
            ? {
                filtered: r.filtered,
                filteredReasons: r.filteredReasons,
                unclassified: r.unclassified,
                byClass: r.byClass,
              }
            : {}),
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
          assetClasses: market.assetClasses,
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
    // A market saved before asset classes has none: residential, as it always was.
    assetClasses: assetClassesOf(market.assetClasses as AssetClass[]),
    land: stored.land,
    commercial: stored.commercial,
  };
}

function assetClassesOf(v: AssetClass[] | null | undefined): AssetClass[] {
  const list = Array.from(new Set(v ?? []));
  return list.length ? list : ['residential'];
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

function defaultLabel(input: MarketInput, classes: AssetClass[]): string {
  const area = input.city?.trim() || input.postalCode?.trim() || 'Market';
  const kind =
    classes.length === 1 && classes[0] === 'residential'
      ? ''
      : ` (${classes.map((c) => ASSET_CLASS_LABEL[c].toLowerCase()).join(', ')})`;
  return `${area}, ${input.state.trim().toUpperCase()}${kind}`;
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
