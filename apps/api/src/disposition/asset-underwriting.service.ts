import { Injectable, NotFoundException } from '@nestjs/common';
import {
  assignmentFeeFor,
  buyerDemandFrom,
  isAssetClass,
  isSubtypeOf,
  normalizeCounty,
  numericFact,
  underwriteCommercial,
  underwriteLand,
  underwriteResidential,
  type AssetUnderwriting,
  type CommercialComparable,
  type CommercialSubtype,
  type LandComparable,
  type LandSubtype,
  type ResidentialSubtype,
  type UnderwritingInput,
} from '@halo/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { BuyerIntelligenceService } from '../buyers/buyer-intelligence.service';
import { PropertyIntelligenceService } from '../assets/property-intelligence.service';
import { DispositionEligibilityService } from './eligibility.service';

const COMP_MONTHS = 36;

export type DealUnderwriting = AssetUnderwriting & {
  /** True when the property has no asset class: the residential model is used until a person confirms one. */
  unclassified: boolean;
  computedAt: string;
};

/**
 * Asset-specific underwriting for a deal (docs/asset-classes.md s5): the
 * residential ARV model for houses, comparable land sales per acre for
 * land, income and comparable sales for commercial property. The strategy
 * is chosen by the property's asset class, never by a model. Everything
 * here is arithmetic on the records; the Deal Underwriter explains it.
 */
@Injectable()
export class AssetUnderwritingService {
  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private eligibility: DispositionEligibilityService,
    private buyers: BuyerIntelligenceService,
    private intelligence: PropertyIntelligenceService,
  ) {}

  /**
   * The inputs of the residential model as the deal stands: the ARV and
   * repairs on record, the tenant's fee, costs and thresholds, and the
   * contract price once there is one.
   */
  async residentialInput(
    accountId: string,
    dealId: string,
  ): Promise<UnderwritingInput> {
    const [deal, agreement, cp] = await Promise.all([
      this.prisma.deal.findFirst({
        where: { id: dealId, accountId },
        include: {
          economics: true,
          underwritingResult: { select: { confidence: true } },
          property: { select: { salePrice: true } },
        },
      }),
      this.eligibility.currentAgreement(accountId, dealId),
      this.controlPlane.getStatus(accountId),
    ]);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const e = deal.economics;
    const knownCosts =
      (e?.closingCosts ?? 0) +
      (e?.marketingCost ?? 0) +
      (e?.otherCost ?? 0) +
      (e?.skipTraceCost ?? 0);
    return {
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      assignmentFee: assignmentFeeFor(
        e?.assignmentFee,
        cp.defaultAssignmentFee,
      ),
      transactionCosts: knownCosts > 0 ? knownCosts : cp.dispositionCosts,
      minNetProfit: cp.minNetProfit,
      confidence: deal.underwritingResult?.confidence ?? null,
      minConfidence: cp.minUnderwritingConfidence,
      contractPrice:
        agreement &&
        agreement.status !== 'terminated' &&
        agreement.status !== 'expired'
          ? (agreement.purchasePrice ?? e?.contractPrice ?? null)
          : (e?.contractPrice ?? null),
      sellerAsk: deal.property?.salePrice ?? null,
    };
  }

  async forDeal(
    accountId: string,
    dealId: string,
    opts: { now?: Date; store?: boolean } = {},
  ): Promise<DealUnderwriting> {
    const now = opts.now ?? new Date();
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: { property: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const p = deal.property;
    const cls = isAssetClass(p?.assetClass) ? p.assetClass : null;
    const base = await this.residentialInput(accountId, dealId);
    const demand = await this.demand(accountId, dealId);

    let result: AssetUnderwriting;
    if (cls === 'land' && p) {
      const facts = await this.intelligence.facts(accountId, p.id);
      const acres =
        numericFact(facts, 'gross_acres')?.value ??
        p.acres ??
        (p.lotSqft ? p.lotSqft / 43_560 : null);
      const comps = await this.landComps(accountId, p.state, p.county, now);
      result = underwriteLand({
        subject: {
          acres,
          subtype: isSubtypeOf('land', p.assetSubtype)
            ? (p.assetSubtype as LandSubtype)
            : null,
          county: p.county,
          zip: p.zip,
          zoning: p.zoning,
        },
        facts,
        comps,
        asOf: now,
        targetFee: base.assignmentFee,
        transactionCosts: base.transactionCosts,
        minNetProfit: base.minNetProfit,
        buyerPricePerAcre: await this.investorPricePerAcre(
          accountId,
          p.state,
          p.county,
          now,
        ),
        contractPrice: base.contractPrice,
        sellerAsk: base.sellerAsk,
        buyerDemand: demand,
      });
    } else if (cls === 'commercial' && p) {
      const facts = await this.intelligence.facts(accountId, p.id);
      const capFact = facts.find((f) => f.key === 'cap_rate');
      result = underwriteCommercial({
        subject: {
          subtype: isSubtypeOf('commercial', p.assetSubtype)
            ? (p.assetSubtype as CommercialSubtype)
            : null,
          county: p.county,
          buildingSqft:
            numericFact(facts, 'building_sqft')?.value ??
            p.buildingSqft ??
            p.sqft,
          units: numericFact(facts, 'units')?.value ?? p.units,
        },
        facts,
        // The cap rate fact carries its own source; one without a source is not used.
        capRate:
          capFact &&
          typeof capFact.value === 'number' &&
          capFact.source &&
          capFact.source !== 'operator'
            ? {
                rate: capFact.value > 1 ? capFact.value / 100 : capFact.value,
                source: capFact.source,
              }
            : capFact && typeof capFact.value === 'number' && capFact.note
              ? {
                  rate: capFact.value > 1 ? capFact.value / 100 : capFact.value,
                  source: capFact.note,
                }
              : null,
        comps: await this.commercialComps(accountId, p.state, p.county, now),
        asOf: now,
        targetFee: base.assignmentFee,
        transactionCosts: base.transactionCosts,
        minNetProfit: base.minNetProfit,
        contractPrice: base.contractPrice,
        sellerAsk: base.sellerAsk,
        buyerDemand: demand,
      });
    } else {
      result = underwriteResidential({
        ...base,
        subtype:
          cls === 'residential' && isSubtypeOf('residential', p?.assetSubtype)
            ? (p!.assetSubtype as ResidentialSubtype)
            : null,
        buyerDemand: demand,
      });
      if (!cls) {
        result.missing.unshift(
          'The property is not classified. Halo uses the residential model until a person confirms it is a house; land and commercial deals are valued differently.',
        );
        if (result.decision === 'pursue') result.decision = 'review';
      }
    }
    const out: DealUnderwriting = {
      ...result,
      unclassified: !cls,
      computedAt: now.toISOString(),
    };
    if (opts.store) await this.store(dealId, p?.id ?? null, out);
    return out;
  }

  /** The most a person may offer the seller without giving a reason: the top of the strategy's offer range. */
  async offerCeiling(
    accountId: string,
    dealId: string,
  ): Promise<{ ceiling: number | null; result: DealUnderwriting }> {
    const result = await this.forDeal(accountId, dealId);
    return { ceiling: result.offerRange?.high ?? null, result };
  }

  /** Recorded on the deal's underwriting row, so agents and history read the same result. */
  private async store(
    dealId: string,
    propertyId: string | null,
    r: DealUnderwriting,
  ) {
    const analysis = r as unknown as Prisma.InputJsonObject;
    await this.prisma.underwritingResult.upsert({
      where: { dealId },
      create: {
        dealId,
        propertyId: propertyId ?? undefined,
        assetClass: r.assetClass,
        strategy: r.strategy,
        analysis,
      },
      update: { assetClass: r.assetClass, strategy: r.strategy, analysis },
    });
  }

  private async demand(accountId: string, dealId: string) {
    try {
      const ranked = await this.buyers.rankForDeal(accountId, dealId, {
        limit: 50,
      });
      return buyerDemandFrom(ranked.considered === 0 ? [] : ranked.matches);
    } catch {
      return buyerDemandFrom(null);
    }
  }

  private since(now: Date): Date {
    const d = new Date(now);
    d.setUTCMonth(d.getUTCMonth() - COMP_MONTHS);
    return d;
  }

  private async countySales(
    accountId: string,
    state: string,
    county: string | null,
    assetClass: string,
    now: Date,
  ) {
    if (!county) return [];
    const rows = await this.prisma.recordedSale.findMany({
      where: {
        accountId,
        state,
        assetClass,
        saleDate: { gte: this.since(now), lte: now },
        price: { gt: 0 },
        armsLength: { not: false },
      },
      orderBy: { saleDate: 'desc' },
      take: 2000,
    });
    const c = normalizeCounty(county);
    return rows.filter((r) => normalizeCounty(r.county) === c);
  }

  private async landComps(
    accountId: string,
    state: string,
    county: string | null,
    now: Date,
  ): Promise<LandComparable[]> {
    const rows = await this.countySales(accountId, state, county, 'land', now);
    return rows
      .filter((r) => (r.acres ?? 0) > 0)
      .map((r) => ({
        ref: r.id,
        saleDate: r.saleDate.toISOString().slice(0, 10),
        price: r.price!,
        acres: r.acres!,
        county: r.county,
        zip: r.zip,
        zoning: r.zoning,
        landUse: r.landUse,
        quality: r.quality,
      }));
  }

  private async commercialComps(
    accountId: string,
    state: string,
    county: string | null,
    now: Date,
  ): Promise<CommercialComparable[]> {
    const rows = await this.countySales(
      accountId,
      state,
      county,
      'commercial',
      now,
    );
    return rows.map((r) => ({
      ref: r.id,
      saleDate: r.saleDate.toISOString().slice(0, 10),
      price: r.price!,
      subtype: isSubtypeOf('commercial', r.assetSubtype)
        ? (r.assetSubtype as CommercialSubtype)
        : null,
      buildingSqft: r.buildingSqft,
      units: r.units,
      county: r.county,
      quality: r.quality,
    }));
  }

  /**
   * What land investors actually paid per acre in the county: recorded
   * land purchases by buyers discovery found to be land buyers. Evidence
   * of the market Halo would sell into, used in place of the default ratio.
   */
  private async investorPricePerAcre(
    accountId: string,
    state: string,
    county: string | null,
    now: Date,
  ): Promise<number | null> {
    const investors = await this.prisma.buyerCandidate.findMany({
      where: {
        accountId,
        status: { not: 'dismissed' },
        assetClasses: { has: 'land' },
      },
      select: { key: true },
      take: 2000,
    });
    if (!investors.length) return null;
    const keys = new Set(investors.map((i) => i.key));
    const sales = (
      await this.countySales(accountId, state, county, 'land', now)
    ).filter((s) => s.buyerKey && keys.has(s.buyerKey) && (s.acres ?? 0) > 0);
    if (sales.length < 3) return null;
    const per = sales.map((s) => s.price! / s.acres!).sort((a, b) => a - b);
    return per[Math.floor(per.length / 2)];
  }
}
