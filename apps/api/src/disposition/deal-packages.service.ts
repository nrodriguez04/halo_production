import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { brandName } from '../communications/outbound-content';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { DispositionEligibilityService } from './eligibility.service';
import { dealEvent } from './timeline-events';

/** Documents a person marked as shareable with buyers carry this tag. */
export const BUYER_SHAREABLE_TAG = 'buyer_shareable';

export interface PackageComp {
  address: string;
  soldPrice: number;
  soldAt: string | null;
  sqft: number | null;
  distanceMiles: number | null;
  source: string;
}

export interface PackageEdits {
  headline?: string;
  description?: string;
  comps?: PackageComp[];
  extraRisks?: string[];
  accessNotes?: string;
  buyerDeposit?: number | null;
  shareableDocumentIds?: string[];
}

/**
 * What a buyer sees. Assembled from a whitelist: the buyer price, the
 * property, estimates labelled as estimates, the risks Halo knows of, and
 * exactly what is being sold (an assignment of a contract, not a deed).
 */
export interface PackageContent {
  headline: string;
  description: string | null;
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    facts: Record<string, string | number>;
    factsSource: string | null;
  };
  price: { askingPrice: number; buyerDeposit: number | null };
  valuation: {
    arv: number | null;
    arvConfidence: number | null;
    arvConfirmed: boolean;
    repairEstimate: number | null;
    basis: string;
    compsSummary: string | null;
    comps: PackageComp[];
  };
  timeline: {
    closeBy: string | null;
    inspectionEndsAt: string | null;
  };
  rightsOffered: string;
  risks: string[];
  disclosures: string[];
  documents: Array<{ id: string; title: string; contentType: string }>;
  photos: Array<{ id: string; title: string }>;
  accessNotes: string | null;
  seller: string;
}

const RIGHTS_OFFERED = (brand: string) =>
  `${brand} holds a contract to purchase this property and is offering to assign that contract. ` +
  `The buyer takes over our position under the purchase agreement and closes with the owner. ` +
  `${brand} is not the owner of record and is not selling the property itself.`;

const STANDARD_DISCLOSURES = [
  'Figures marked as estimates (after-repair value, repairs) are our opinion, not an appraisal or inspection. Do your own due diligence before you commit.',
  'Nothing here is a promise of any return, profit or resale price.',
  'An assignment is binding only when the written assignment agreement is signed by both parties.',
];

/**
 * Deal packages (docs/contract-flipping.md s5): versioned, approved by a
 * person before any buyer sees them, and checked to contain no seller-side
 * figure. A new draft supersedes nothing until it is approved.
 */
@Injectable()
export class DealPackagesService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private controlPlane: ControlPlaneService,
    private eligibility: DispositionEligibilityService,
  ) {}

  async list(accountId: string, dealId: string) {
    return this.prisma.dealPackage.findMany({
      where: { accountId, dealId },
      orderBy: { version: 'desc' },
    });
  }

  async latestApproved(accountId: string, dealId: string) {
    return this.prisma.dealPackage.findFirst({
      where: { accountId, dealId, status: 'approved' },
      orderBy: { version: 'desc' },
    });
  }

  /** A new draft version, built from the deal as it stands. */
  async createDraft(
    accountId: string,
    dealId: string,
    userId: string | null,
    askingPrice: number,
    edits: PackageEdits = {},
  ) {
    const content = await this.build(accountId, dealId, askingPrice, edits);
    const last = await this.prisma.dealPackage.findFirst({
      where: { dealId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const pkg = await this.prisma.dealPackage.create({
      data: {
        accountId,
        dealId,
        version: (last?.version ?? 0) + 1,
        status: 'draft',
        askingPrice,
        content: content as unknown as Prisma.InputJsonObject,
        createdBy: userId,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'DEAL_PACKAGE_DRAFTED',
      {
        packageId: pkg.id,
        version: pkg.version,
        askingPrice,
      },
      userId,
    );
    return pkg;
  }

  /** Edit a draft: rebuilt from the deal with the person's edits on top. */
  async updateDraft(
    accountId: string,
    packageId: string,
    userId: string,
    edits: PackageEdits & { askingPrice?: number },
  ) {
    const pkg = await this.owned(accountId, packageId);
    if (pkg.status !== 'draft') {
      throw new ConflictException(
        'Only a draft package can be edited; create a new version.',
      );
    }
    const previous = pkg.content as unknown as PackageContent;
    const askingPrice = edits.askingPrice ?? pkg.askingPrice;
    const merged: PackageEdits = {
      headline: edits.headline ?? previous.headline,
      description: edits.description ?? previous.description ?? undefined,
      comps: edits.comps ?? previous.valuation.comps,
      accessNotes: edits.accessNotes ?? previous.accessNotes ?? undefined,
      buyerDeposit:
        edits.buyerDeposit !== undefined
          ? edits.buyerDeposit
          : previous.price.buyerDeposit,
      shareableDocumentIds: edits.shareableDocumentIds,
      extraRisks: edits.extraRisks,
    };
    const content = await this.build(
      accountId,
      pkg.dealId,
      askingPrice,
      merged,
    );
    const updated = await this.prisma.dealPackage.update({
      where: { id: pkg.id },
      data: {
        askingPrice,
        content: content as unknown as Prisma.InputJsonObject,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      pkg.dealId,
      'DEAL_PACKAGE_EDITED',
      {
        packageId: pkg.id,
        fields: Object.keys(edits),
      },
      userId,
    );
    return updated;
  }

  /** A person approves the package; the previous approved version is superseded. */
  async approve(accountId: string, packageId: string, userId: string) {
    const pkg = await this.owned(accountId, packageId);
    if (pkg.status === 'approved') return pkg;
    if (pkg.status !== 'draft') {
      throw new ConflictException(`Package is ${pkg.status}`);
    }
    // The figures are checked again at approval: the deal may have moved.
    await this.assertNoSellerFigures(accountId, pkg.dealId, pkg.content);
    await this.prisma.dealPackage.updateMany({
      where: { dealId: pkg.dealId, status: 'approved' },
      data: { status: 'superseded' },
    });
    const approved = await this.prisma.dealPackage.update({
      where: { id: pkg.id },
      data: { status: 'approved', approvedAt: new Date(), approvedBy: userId },
    });
    await dealEvent(
      this.timeline,
      accountId,
      pkg.dealId,
      'DEAL_PACKAGE_APPROVED',
      {
        packageId: pkg.id,
        version: pkg.version,
        askingPrice: pkg.askingPrice,
      },
      userId,
    );
    return approved;
  }

  async build(
    accountId: string,
    dealId: string,
    askingPrice: number,
    edits: PackageEdits = {},
  ): Promise<PackageContent> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        property: {
          include: {
            sourceRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
          },
        },
        lead: { select: { canonicalState: true } },
        underwritingResult: true,
        closingFile: { include: { issues: { where: { status: 'open' } } } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    if (!deal.property) {
      throw new BadRequestException(
        'The deal has no property, so there is nothing to show buyers.',
      );
    }
    const [agreement, cp, docs] = await Promise.all([
      this.eligibility.currentAgreement(accountId, dealId),
      this.controlPlane.getStatus(accountId),
      this.prisma.document.findMany({
        where: {
          accountId,
          status: 'active',
          OR: [{ dealId }, ...(deal.leadId ? [{ leadId: deal.leadId }] : [])],
        },
        select: {
          id: true,
          title: true,
          contentType: true,
          tags: true,
          category: true,
        },
      }),
    ]);
    const brand = brandName();
    const state =
      normalizeState(
        deal.property.state ?? deal.lead?.canonicalState ?? null,
      ) ?? deal.property.state;
    const confidence = deal.underwritingResult?.confidence ?? null;
    const arvConfirmed =
      confidence != null && confidence >= cp.minUnderwritingConfidence;
    const { facts, source } = propertyFacts(deal.property.sourceRecords);

    // Buyer disclosures are always shared; anything else only when a person
    // tagged it shareable (or picked it on the package).
    const disclosureDocs = docs.filter((d) =>
      d.tags.some(
        (t) =>
          t.startsWith('checklist:') &&
          DISCLOSURE_KEYS.has(t.slice('checklist:'.length)),
      ),
    );
    const picked = new Set(edits.shareableDocumentIds ?? []);
    const shareable = docs.filter(
      (d) =>
        !d.contentType.startsWith('image/') &&
        (d.tags.includes(BUYER_SHAREABLE_TAG) ||
          picked.has(d.id) ||
          disclosureDocs.some((x) => x.id === d.id)) &&
        d.category !== 'contract' &&
        d.category !== 'agreement_template',
    );
    const photos = docs.filter(
      (d) =>
        d.contentType.startsWith('image/') &&
        (d.category === 'marketing' || d.tags.includes(BUYER_SHAREABLE_TAG)),
    );

    const risks: string[] = [];
    if (!arvConfirmed) {
      risks.push(
        confidence == null
          ? 'No underwriting confidence is recorded for the after-repair value: treat it as unconfirmed.'
          : `Our after-repair value has low confidence (${Math.round(confidence * 100)}%): confirm it with your own comparables.`,
      );
    }
    if (deal.closingFile && deal.closingFile.titleStatus !== 'clear') {
      risks.push(
        `Title is not yet clear (status: ${deal.closingFile.titleStatus.replace(/_/g, ' ')}).`,
      );
    }
    for (const i of deal.closingFile?.issues ?? []) {
      if (i.severity === 'warning')
        risks.push(`${capitalize(i.kind)}: ${i.description}`);
    }
    if (
      agreement?.inspectionEndsAt &&
      agreement.inspectionEndsAt.getTime() < Date.now()
    ) {
      risks.push(
        'The inspection period under the purchase agreement has ended.',
      );
    }
    if (agreement?.assignability === 'consent_required') {
      risks.push(
        "The purchase agreement allows assignment with the seller's consent, which has been obtained in writing.",
      );
    }
    for (const r of edits.extraRisks ?? []) risks.push(r);

    const content: PackageContent = {
      headline:
        edits.headline ??
        `${facts.beds ? `${facts.beds} bed ` : ''}${facts.propertyType ?? 'Property'} in ${deal.property.city}, ${state}`,
      description: edits.description ?? null,
      property: {
        address: deal.property.address,
        city: deal.property.city,
        state: state ?? deal.property.state,
        zip: deal.property.zip,
        facts,
        factsSource: source,
      },
      price: {
        askingPrice,
        buyerDeposit: edits.buyerDeposit ?? null,
      },
      valuation: {
        arv: deal.arv ?? deal.underwritingResult?.arv ?? null,
        arvConfidence: confidence,
        arvConfirmed,
        repairEstimate:
          deal.repairEstimate ??
          deal.underwritingResult?.repairEstimate ??
          null,
        basis:
          'Estimates from our underwriting; not an appraisal or an inspection.',
        compsSummary: compsSummaryOf(deal.underwritingResult?.compsSummary),
        comps: edits.comps ?? [],
      },
      timeline: {
        closeBy: agreement?.closingDeadline?.toISOString().slice(0, 10) ?? null,
        inspectionEndsAt:
          agreement?.inspectionEndsAt?.toISOString().slice(0, 10) ?? null,
      },
      rightsOffered: RIGHTS_OFFERED(brand),
      risks,
      disclosures: STANDARD_DISCLOSURES,
      documents: shareable.map((d) => ({
        id: d.id,
        title: d.title,
        contentType: d.contentType,
      })),
      photos: photos.map((d) => ({ id: d.id, title: d.title })),
      accessNotes: edits.accessNotes ?? null,
      seller: brand,
    };
    await this.assertNoSellerFigures(accountId, dealId, content);
    return content;
  }

  /**
   * The safety net under the whitelist: no number in the package may equal
   * the contract price or the offer made to the seller. Advertising either
   * gives the fee away. The asking price is left out of the scan (it is
   * checked against the floor, which is above the contract price), and so
   * are the address and zip: they are numbers, not prices. The MAO is an
   * internal estimate, not a term of the deal, and is not scanned for.
   */
  async assertNoSellerFigures(
    accountId: string,
    dealId: string,
    content: unknown,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        offerAmount: true,
        economics: { select: { contractPrice: true } },
      },
    });
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      dealId,
    );
    const figures = [
      deal?.offerAmount,
      deal?.economics?.contractPrice,
      agreement?.purchasePrice,
    ].filter((n): n is number => typeof n === 'number' && n > 0);
    const found = numbersIn(withoutLocation(content)).filter((n) =>
      figures.some((f) => Math.abs(f - n) < 0.5),
    );
    if (found.length) {
      throw new BadRequestException(
        `The package would show a seller-side figure (${found.map((n) => `$${n.toLocaleString('en-US')}`).join(', ')}). Remove it from the description, comps or deposit before continuing.`,
      );
    }
  }

  private async owned(accountId: string, packageId: string) {
    const pkg = await this.prisma.dealPackage.findFirst({
      where: { id: packageId, accountId },
    });
    if (!pkg) throw new NotFoundException(`Package ${packageId} not found`);
    return pkg;
  }
}

/** Checklist items that are disclosures to buyers and so are always shared. */
const DISCLOSURE_KEYS = new Set([
  'equitable_interest_disclosure',
  'seller_disclosure',
  'wire_fraud_notice',
]);

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function compsSummaryOf(v: unknown): string | null {
  if (!v || typeof v !== 'object') return null;
  const s = (v as Record<string, unknown>).summary;
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, 2000) : null;
}

function withoutLocation(content: unknown): unknown {
  if (!content || typeof content !== 'object') return content;
  const c = content as Record<string, unknown>;
  const property =
    c.property && typeof c.property === 'object'
      ? { ...(c.property as Record<string, unknown>), address: null, zip: null }
      : c.property;
  const valuation =
    c.valuation && typeof c.valuation === 'object'
      ? {
          ...(c.valuation as Record<string, unknown>),
          comps: Array.isArray((c.valuation as Record<string, unknown>).comps)
            ? (
                (c.valuation as Record<string, unknown>).comps as Array<
                  Record<string, unknown>
                >
              ).map((x) => ({ ...x, address: null }))
            : [],
        }
      : c.valuation;
  const price =
    c.price && typeof c.price === 'object'
      ? { ...(c.price as Record<string, unknown>), askingPrice: null }
      : c.price;
  return { ...c, property, valuation, price };
}

/** Every number in a JSON value, including numbers written inside strings. */
export function numbersIn(value: unknown): number[] {
  const out: number[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
    else if (typeof v === 'string') {
      for (const m of v.matchAll(/\$?\d[\d,]*(?:\.\d+)?/g)) {
        const n = Number(m[0].replace(/[$,]/g, ''));
        if (Number.isFinite(n) && n >= 1000) out.push(n);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return out;
}

type SourceRow = { provider: string; response: unknown };

/** Beds, baths, size, year and type from the property's data records, with the provider named. */
export function propertyFacts(records: SourceRow[]): {
  facts: Record<string, string | number>;
  source: string | null;
} {
  const o = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  const n = (v: unknown) => {
    const x = typeof v === 'string' ? Number(v) : v;
    return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined;
  };
  const s = (v: unknown) =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, 60) : undefined;
  for (const r of records) {
    const res = o(r.response);
    let facts: Record<string, string | number | undefined> = {};
    if (r.provider === 'attom') {
      const p = o(
        (Array.isArray(res.property) ? res.property[0] : null) ?? res,
      );
      const summary = o(p.summary);
      const building = o(p.building);
      facts = {
        propertyType: s(summary.proptype) ?? s(summary.propclass),
        beds: n(o(building.rooms).beds),
        baths: n(o(building.rooms).bathstotal),
        sqft:
          n(o(building.size).universalsize) ?? n(o(building.size).livingsize),
        yearBuilt: n(summary.yearbuilt),
      };
    } else if (
      r.provider === 'rentcast' ||
      r.provider === 'realie' ||
      r.provider === 'mls'
    ) {
      facts = {
        propertyType: s(res.propertyType),
        beds: n(res.bedrooms),
        baths: n(res.bathrooms),
        sqft: n(res.squareFootage) ?? n(res.livingArea),
        yearBuilt: n(res.yearBuilt),
      };
    }
    const clean = Object.fromEntries(
      Object.entries(facts).filter(([, v]) => v !== undefined),
    ) as Record<string, string | number>;
    if (Object.keys(clean).length >= 2) {
      return { facts: clean, source: r.provider };
    }
  }
  return { facts: {}, source: null };
}
