import { Injectable } from '@nestjs/common';
import {
  aggregateSales,
  rankGeos,
  recommendMarkets,
  toJurisdictionCode,
  type ActivationStatus,
  type GeoLevel,
  type GeoStats,
  type MarketClassification,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { MarketsService } from '../markets/markets.service';
import { toNormalized } from './recorded-sales.service';

const DAY = 86_400_000;
const DISTRESS_TAGS = [
  'foreclosure',
  'preforeclosure',
  'tax:delinquent',
  'lien',
  'distressed_sale',
  'vacant',
  'tax_sale',
];

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Market intelligence (docs/data-pipeline.md s5): counties and zips ranked
 * from recorded sales and Halo's own leads and closings, and the states to
 * activate next. Covers every jurisdiction Halo has data for, whatever its
 * legal status: research is allowed everywhere.
 */
@Injectable()
export class MarketIntelligenceService {
  constructor(
    private prisma: PrismaService,
    private markets: MarketsService,
  ) {}

  private async stats(
    accountId: string,
    level: GeoLevel,
    state: string | null,
    asOf: Date,
  ): Promise<GeoStats[]> {
    const rows = await this.prisma.recordedSale.findMany({
      where: {
        accountId,
        ...(state ? { state } : {}),
        saleDate: { gte: new Date(asOf.getTime() - 913 * DAY) },
      },
    });
    const geos = aggregateSales(rows.map(toNormalized), level, asOf);
    if (!geos.length) return [];

    // Distress: leads with distress signals, by zip or by their property's county.
    const leads = await this.prisma.lead.findMany({
      where: {
        accountId,
        tags: { hasSome: DISTRESS_TAGS },
        ...(state ? { canonicalState: state } : {}),
      },
      select: {
        canonicalZip: true,
        properties: { select: { countyFips: true }, take: 1 },
      },
    });
    const distress = new Map<string, number>();
    for (const l of leads) {
      const k =
        level === 'zip'
          ? l.canonicalZip?.slice(0, 5)
          : l.properties[0]?.countyFips;
      if (k) distress.set(k, (distress.get(k) ?? 0) + 1);
    }

    // Halo's own closings: realized fees and days from contract to close.
    const closed = await this.prisma.closingFile.findMany({
      where: { accountId, status: 'closed' },
      select: {
        closedAt: true,
        realizedFee: true,
        deal: {
          select: {
            property: { select: { zip: true, countyFips: true } },
            purchaseAgreements: {
              select: { executedAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        },
      },
    });
    const outcomes = new Map<string, { fees: number[]; days: number[] }>();
    for (const c of closed) {
      const k =
        level === 'zip'
          ? c.deal?.property?.zip?.slice(0, 5)
          : c.deal?.property?.countyFips;
      if (!k) continue;
      const o = outcomes.get(k) ?? { fees: [], days: [] };
      if (c.realizedFee != null) o.fees.push(c.realizedFee);
      const exec = c.deal?.purchaseAgreements[0]?.executedAt;
      if (exec && c.closedAt)
        o.days.push((c.closedAt.getTime() - exec.getTime()) / DAY);
      outcomes.set(k, o);
    }

    const matrix = await this.markets.matrix(accountId);
    const byState = new Map(matrix.rows.map((r) => [r.state, r]));
    return geos.map((g) => {
      const o = outcomes.get(g.key);
      const m = byState.get(g.state);
      return {
        ...g,
        distressLeads: distress.get(g.key) ?? 0,
        haloClosed: o?.fees.length ?? 0,
        haloMedianFee: o ? median(o.fees) : null,
        haloMedianDaysToClose: o ? median(o.days) : null,
        marketStatus: (m?.effectiveStatus as ActivationStatus) ?? null,
        classification: (m?.classification as MarketClassification) ?? null,
      };
    });
  }

  /** Counties or zips, best first, each with its ten explained components. */
  async geos(
    accountId: string,
    q: { level?: GeoLevel; state?: string | null; limit?: number },
  ) {
    const asOf = new Date();
    const level = q.level ?? 'county';
    const state = q.state ? toJurisdictionCode(q.state) : null;
    const ranked = rankGeos(
      await this.stats(accountId, level, state, asOf),
      asOf,
    );
    return {
      level,
      state,
      asOf,
      total: ranked.length,
      geos: ranked.slice(0, Math.min(q.limit ?? 50, 500)),
    };
  }

  /** States to work on next: opportunity times how close each is to operating lawfully. */
  async recommendations(accountId: string, limit = 10) {
    const asOf = new Date();
    const [counties, matrix] = await Promise.all([
      this.stats(accountId, 'county', null, asOf),
      this.markets.matrix(accountId),
    ]);
    const ranked = rankGeos(counties, asOf);
    const proposed = new Set(
      matrix.rows
        .filter((r) => r.classificationSource === 'draft')
        .map((r) => r.state),
    );
    const recommendations = recommendMarkets(
      matrix.rows.map((r) => ({
        state: r.state,
        status: r.effectiveStatus as ActivationStatus,
        classification: r.classification as MarketClassification,
        nextStep: r.nextStep,
        missing: r.missing.length,
      })),
      ranked,
      limit,
    ).map((r) => ({
      ...r,
      // A class from research, not yet approved by counsel.
      classificationProposed: proposed.has(r.state),
    }));
    return {
      asOf,
      recommendations,
      dataCoverage: {
        counties: ranked.length,
        states: new Set(ranked.map((g) => g.state)).size,
      },
    };
  }
}
