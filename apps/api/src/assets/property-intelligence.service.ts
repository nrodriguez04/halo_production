import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Property } from '@prisma/client';
import {
  FACT_BY_KEY,
  FACT_STATUSES,
  OPERATOR_ONLY_SUBTYPES,
  classifyProperty,
  criticalUnknowns,
  diligenceStatus,
  factChecklist,
  isAssetClass,
  isHighRiskFloodZone,
  isSubtypeOf,
  normalizeCounty,
  parcelKey,
  propertyLabel,
  DILIGENCE_TAG_PREFIX,
  type AssetClass,
  type AssetClassification,
  type ClassificationInput,
  type FactRecord,
  type FactStatus,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { PublicGisService } from '../integrations/public-gis/public-gis.service';

/** What a source said about a parcel, ready to classify and store. */
export interface ParcelFacts {
  apn: string | null;
  county: string | null;
  countyFips?: string | null;
  latitude: number | null;
  longitude: number | null;
  acres: number | null;
  lotSqft?: number | null;
  buildingSqft: number | null;
  livingSqft?: number | null;
  units: number | null;
  yearBuilt: number | null;
  /** The provider's labels and codes, as given. */
  labels: Array<string | null | undefined>;
  landUse: string | null;
  zoning: string | null;
  improvementValue: number | null;
  residentialFlag: boolean | null;
  hasStructure: boolean | null;
  assessedValue: number | null;
  marketValue: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  ownerKind: string | null;
  absentee: boolean | null;
  source: string;
}

export interface FactInput {
  key: string;
  value: number | boolean | string | null;
  status: FactStatus;
  source?: string | null;
  sourceUrl?: string | null;
  documentId?: string | null;
  note?: string | null;
}

/**
 * What Halo knows about a property, by asset class (docs/asset-classes.md
 * s2 and s4): its classification and how it was reached, the facts its
 * class turns on with their status, and the public-record checks that
 * fill some of them for free. A person's classification always stands
 * over the rules; a code mapping a person confirmed stands over the
 * rules too.
 */
@Injectable()
export class PropertyIntelligenceService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private gis: PublicGisService,
  ) {}

  // ------------------------------------------------------- classification

  /** The classification input for a stored property. */
  static inputOf(
    p: Property,
    extra: Partial<ClassificationInput> = {},
  ): ClassificationInput {
    return {
      labels: [p.propertyType, p.landUse],
      zoning: p.zoning,
      units: p.units,
      buildingSqft: p.buildingSqft ?? p.sqft,
      yearBuilt: p.yearBuilt,
      lotSqft: p.lotSqft,
      acres: p.acres,
      improvementValue: p.improvementValue,
      ...extra,
    };
  }

  /** A confirmed mapping for the property's use code, if one exists. */
  async mappingFor(
    accountId: string,
    state: string,
    county: string | null,
    provider: string | null,
    code: string | null,
  ) {
    if (!code) return null;
    const rows = await this.prisma.assetCodeMapping.findMany({
      where: {
        accountId,
        state,
        code,
        county: { in: ['', normalizeCounty(county) ?? ''] },
        provider: { in: ['', provider ?? ''] },
      },
    });
    // The most specific mapping wins: county and provider before either alone.
    rows.sort(
      (a, b) =>
        Number(!!b.county) +
        Number(!!b.provider) -
        (Number(!!a.county) + Number(!!a.provider)),
    );
    return rows[0] ?? null;
  }

  /**
   * Classify and store. A person's classification is never overwritten; a
   * weaker reading never replaces a class already on record.
   */
  async classify(
    accountId: string,
    propertyId: string,
    extra: Partial<ClassificationInput> = {},
  ): Promise<AssetClassification | null> {
    const p = await this.prisma.property.findFirst({
      where: { id: propertyId, accountId },
    });
    if (!p) return null;
    if (p.assetClassBasis === 'operator') return null;
    const mapping = await this.mappingFor(
      accountId,
      p.state,
      p.county,
      p.dataSource,
      p.landUse,
    );
    if (mapping && isAssetClass(mapping.assetClass)) {
      await this.prisma.property.update({
        where: { id: p.id },
        data: {
          assetClass: mapping.assetClass,
          assetSubtype: mapping.assetSubtype,
          assetClassBasis: 'mapping',
          assetClassConfidence: null,
          assetClassReasons: [
            `use code "${mapping.code}" confirmed as ${mapping.assetClass}${mapping.assetSubtype ? ` (${mapping.assetSubtype})` : ''}`,
          ],
          assetClassSetAt: new Date(),
        },
      });
      return null;
    }
    const c = classifyProperty(PropertyIntelligenceService.inputOf(p, extra));
    if (!c.assetClass && p.assetClass) return c;
    await this.prisma.property.update({
      where: { id: p.id },
      data: {
        assetClass: c.assetClass,
        assetSubtype: c.subtype,
        assetClassBasis: c.assetClass ? 'rules' : null,
        assetClassConfidence: c.confidence,
        assetClassReasons: c.assetClass
          ? c.reasons
          : [...c.reasons, c.unresolved ?? 'unclassified'],
        assetClassSetAt: new Date(),
      },
    });
    return c;
  }

  /** A person settles what the property is. Recorded and audited. */
  async setAssetClass(
    accountId: string,
    propertyId: string,
    userId: string,
    input: {
      assetClass: AssetClass | null;
      subtype?: string | null;
      reason?: string | null;
    },
  ) {
    const p = await this.owned(accountId, propertyId);
    if (
      input.assetClass &&
      input.subtype &&
      !isSubtypeOf(input.assetClass, input.subtype)
    ) {
      throw new BadRequestException(
        `${input.subtype} is not a ${input.assetClass} subtype`,
      );
    }
    const updated = await this.prisma.property.update({
      where: { id: p.id },
      data: input.assetClass
        ? {
            assetClass: input.assetClass,
            assetSubtype: input.subtype ?? null,
            assetClassBasis: 'operator',
            assetClassConfidence: null,
            assetClassReasons: [input.reason?.trim() || 'set by a person'],
            assetClassSetBy: userId,
            assetClassSetAt: new Date(),
          }
        : {
            // Clearing hands the property back to the rules.
            assetClass: null,
            assetSubtype: null,
            assetClassBasis: null,
            assetClassReasons: [],
            assetClassSetBy: userId,
            assetClassSetAt: new Date(),
          },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'property.asset_class.set',
      resource: `property:${p.id}`,
      details: {
        from: {
          assetClass: p.assetClass,
          subtype: p.assetSubtype,
          basis: p.assetClassBasis,
        },
        to: input,
      },
    });
    if (!input.assetClass) await this.classify(accountId, p.id);
    return updated;
  }

  /**
   * Confirm what a county use code means and apply it to every property
   * with that code that a person has not classified by hand.
   */
  async addCodeMapping(
    accountId: string,
    userId: string,
    input: {
      state: string;
      county?: string | null;
      provider?: string | null;
      code: string;
      assetClass: AssetClass;
      subtype?: string | null;
    },
  ) {
    if (input.subtype && !isSubtypeOf(input.assetClass, input.subtype)) {
      throw new BadRequestException(
        `${input.subtype} is not a ${input.assetClass} subtype`,
      );
    }
    if (
      input.subtype &&
      OPERATOR_ONLY_SUBTYPES.includes(input.subtype as never)
    ) {
      throw new BadRequestException(
        `${input.subtype} is a judgement about one parcel; set it on the property, not for a whole code`,
      );
    }
    const state = input.state.trim().toUpperCase();
    const county = normalizeCounty(input.county) ?? '';
    const provider = input.provider?.trim() ?? '';
    const code = input.code.trim();
    const mapping = await this.prisma.assetCodeMapping.upsert({
      where: {
        accountId_state_county_provider_code: {
          accountId,
          state,
          county,
          provider,
          code,
        },
      },
      create: {
        accountId,
        state,
        county,
        provider,
        code,
        assetClass: input.assetClass,
        assetSubtype: input.subtype ?? null,
        createdBy: userId,
      },
      update: {
        assetClass: input.assetClass,
        assetSubtype: input.subtype ?? null,
        createdBy: userId,
      },
    });
    const targets = await this.prisma.property.findMany({
      where: {
        accountId,
        state,
        landUse: code,
        ...(provider ? { dataSource: provider } : {}),
        OR: [
          { assetClassBasis: null },
          { assetClassBasis: { not: 'operator' } },
        ],
      },
      select: { id: true, county: true },
      take: 5000,
    });
    let applied = 0;
    for (const t of targets) {
      if (county && normalizeCounty(t.county) !== county) continue;
      await this.classify(accountId, t.id);
      applied++;
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'asset_code_mapping.set',
      resource: `asset_code_mapping:${mapping.id}`,
      details: { ...input, applied },
    });
    return { mapping, applied };
  }

  // ------------------------------------------------------------- parcels

  /** The property row for a parcel a source returned: found by parcel key, else created. */
  async upsertParcel(
    accountId: string,
    leadId: string | null,
    address: {
      street: string | null;
      city: string | null;
      state: string;
      zip: string | null;
    },
    facts: ParcelFacts,
  ): Promise<{ propertyId: string; created: boolean }> {
    const key = parcelKey(address.state, facts.county, facts.apn);
    const known = <T>(v: T | null | undefined) =>
      v === null || v === undefined ? undefined : v;
    const data = {
      apn: known(facts.apn),
      county: known(facts.county),
      countyFips: known(facts.countyFips),
      latitude: known(facts.latitude),
      longitude: known(facts.longitude),
      acres: known(facts.acres),
      lotSqft: known(
        facts.lotSqft ??
          (facts.acres ? Math.round(facts.acres * 43_560) : null),
      ),
      buildingSqft: known(facts.buildingSqft),
      sqft: known(facts.livingSqft),
      units: known(facts.units != null ? Math.round(facts.units) : null),
      yearBuilt: known(facts.yearBuilt),
      landUse: known(facts.landUse),
      propertyType: known(
        facts.labels.find((l) => l && l !== facts.landUse) ?? null,
      ),
      zoning: known(facts.zoning),
      improvementValue: known(facts.improvementValue),
      assessedValue: known(facts.assessedValue),
      estimatedValue: known(facts.marketValue),
      lastSaleDate: facts.lastSaleDate
        ? new Date(`${facts.lastSaleDate.slice(0, 10)}T00:00:00Z`)
        : undefined,
      lastSalePrice: known(facts.lastSalePrice),
      ownerKind: known(facts.ownerKind),
      absentee: known(facts.absentee),
      parcelKey: known(key),
      dataSource: facts.source,
      dataQuality: 'reported',
      dataUpdatedAt: new Date(),
    };
    const existing = key
      ? await this.prisma.property.findFirst({
          where: { accountId, parcelKey: key },
          select: { id: true, leadId: true },
        })
      : address.street && address.zip
        ? await this.prisma.property.findFirst({
            where: {
              accountId,
              address: { equals: address.street, mode: 'insensitive' },
              zip: address.zip,
            },
            select: { id: true, leadId: true },
          })
        : null;
    let propertyId: string;
    let created = false;
    if (existing) {
      propertyId = existing.id;
      await this.prisma.property.update({
        where: { id: existing.id },
        data: { ...data, ...(existing.leadId || !leadId ? {} : { leadId }) },
      });
    } else {
      const row = await this.prisma.property.create({
        data: {
          accountId,
          leadId,
          address: address.street || null,
          city: address.city || null,
          state: address.state,
          zip: address.zip || null,
          ...data,
        },
      });
      propertyId = row.id;
      created = true;
    }
    await this.classify(accountId, propertyId, {
      residentialFlag: facts.residentialFlag,
      hasStructure: facts.hasStructure,
    });
    await this.seedProviderFacts(accountId, propertyId, facts);
    return { propertyId, created };
  }

  /** What a provider reported becomes facts with status `reported`; nothing a person entered is replaced. */
  async seedProviderFacts(
    accountId: string,
    propertyId: string,
    facts: ParcelFacts,
  ): Promise<void> {
    const seeds: FactInput[] = [];
    if (facts.acres)
      seeds.push({
        key: 'gross_acres',
        value: Math.round(facts.acres * 1000) / 1000,
        status: 'reported',
      });
    if (facts.zoning)
      seeds.push({ key: 'zoning', value: facts.zoning, status: 'reported' });
    if (facts.buildingSqft)
      seeds.push({
        key: 'building_sqft',
        value: facts.buildingSqft,
        status: 'reported',
      });
    if (facts.units)
      seeds.push({ key: 'units', value: facts.units, status: 'reported' });
    for (const s of seeds) {
      const current = await this.prisma.propertyFact.findUnique({
        where: { propertyId_key: { propertyId, key: s.key } },
      });
      if (current && current.source !== facts.source) continue;
      await this.prisma.propertyFact.upsert({
        where: { propertyId_key: { propertyId, key: s.key } },
        create: {
          accountId,
          propertyId,
          key: s.key,
          value: s.value as Prisma.InputJsonValue,
          status: s.status,
          source: facts.source,
          observedAt: new Date(),
        },
        update: {
          value: s.value as Prisma.InputJsonValue,
          status: s.status,
          observedAt: new Date(),
        },
      });
    }
  }

  // --------------------------------------------------------------- facts

  async facts(accountId: string, propertyId: string): Promise<FactRecord[]> {
    const rows = await this.prisma.propertyFact.findMany({
      where: { accountId, propertyId },
    });
    return rows.map((r) => ({
      key: r.key,
      value: (r.value ?? null) as FactRecord['value'],
      status: r.status as FactStatus,
      source: r.source,
      sourceUrl: r.sourceUrl,
      documentId: r.documentId,
      observedAt: r.observedAt,
      note: r.note,
    }));
  }

  /** A person records a fact. The status must say how it is known; a document can back it. */
  async recordFact(
    accountId: string,
    propertyId: string,
    userId: string,
    input: FactInput,
  ) {
    await this.owned(accountId, propertyId);
    const def = FACT_BY_KEY[input.key];
    if (!def) throw new BadRequestException(`Unknown fact "${input.key}"`);
    if (!(FACT_STATUSES as readonly string[]).includes(input.status)) {
      throw new BadRequestException(`Unknown status "${input.status}"`);
    }
    const value = input.value;
    if (value != null) {
      const ok =
        def.type === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : def.type === 'boolean'
            ? typeof value === 'boolean'
            : typeof value === 'string';
      if (!ok)
        throw new BadRequestException(
          `${def.label} takes a ${def.type === 'document' ? 'document' : def.type} value`,
        );
    } else if (
      input.status !== 'unknown' &&
      input.status !== 'needs_diligence' &&
      !input.documentId
    ) {
      throw new BadRequestException(
        `${def.label}: give a value or a document, or mark it unknown`,
      );
    }
    if (
      input.status === 'verified' &&
      !input.documentId &&
      !input.source?.trim()
    ) {
      throw new BadRequestException(
        'A verified fact needs its source or a document',
      );
    }
    if (input.documentId) {
      const doc = await this.prisma.document.findFirst({
        where: { id: input.documentId, accountId },
        select: { id: true },
      });
      if (!doc) throw new BadRequestException('Document not found');
    }
    const before = await this.prisma.propertyFact.findUnique({
      where: { propertyId_key: { propertyId, key: input.key } },
    });
    const data = {
      value:
        value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
      status: input.status,
      source: input.source?.trim() || 'operator',
      sourceUrl: input.sourceUrl ?? null,
      documentId: input.documentId ?? null,
      note: input.note ?? null,
      observedAt: new Date(),
      recordedBy: userId,
    };
    const row = await this.prisma.propertyFact.upsert({
      where: { propertyId_key: { propertyId, key: input.key } },
      create: { accountId, propertyId, key: input.key, ...data },
      update: data,
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'property.fact.record',
      resource: `property:${propertyId}`,
      details: {
        key: input.key,
        before: before
          ? {
              value: before.value,
              status: before.status,
              source: before.source,
            }
          : null,
        after: {
          value: input.value,
          status: input.status,
          source: data.source,
          documentId: data.documentId,
        },
      },
    });
    // Zoning and size feed the classification.
    if (
      ['zoning', 'units', 'building_sqft', 'gross_acres'].includes(input.key) &&
      value != null
    ) {
      const patch =
        input.key === 'zoning'
          ? { zoning: String(value) }
          : input.key === 'units'
            ? { units: Math.round(Number(value)) }
            : input.key === 'building_sqft'
              ? { buildingSqft: Number(value) }
              : { acres: Number(value) };
      await this.prisma.property.update({
        where: { id: propertyId },
        data: patch,
      });
      await this.classify(accountId, propertyId);
    }
    return row;
  }

  /**
   * FEMA flood zones and mapped wetlands for the parcel, from its
   * coordinates. Free, but an external call: refused when external data is
   * off. Recorded as facts with the map as their source.
   */
  async checkPublicRecords(
    accountId: string,
    propertyId: string,
    userId: string | null,
  ) {
    const p = await this.owned(accountId, propertyId);
    if (p.latitude == null || p.longitude == null) {
      throw new BadRequestException(
        'The property has no coordinates; geocode it or enter them first',
      );
    }
    const point = {
      latitude: p.latitude,
      longitude: p.longitude,
      acres: p.acres ?? (p.lotSqft ? p.lotSqft / 43_560 : null),
    };
    const ctx = {
      accountId,
      propertyId,
      actor: userId ? ('user' as const) : ('system' as const),
      userId: userId ?? undefined,
    };
    const out: { flood: string | null; wetlands: string[]; errors: string[] } =
      { flood: null, wetlands: [], errors: [] };
    const area = point.acres
      ? `over roughly ${Math.round(point.acres * 10) / 10} acres around the parcel's coordinates`
      : "at the parcel's coordinates";
    try {
      const flood = await this.gis.floodZones(point, ctx);
      out.flood = flood.worst;
      await this.upsertSystemFact(accountId, propertyId, {
        key: 'flood_zone',
        value: flood.worst,
        status: flood.worst ? 'verified' : 'unknown',
        source: 'FEMA National Flood Hazard Layer',
        sourceUrl: flood.sourceUrl,
        note: flood.worst
          ? `Zones ${area}: ${flood.zones.map((z) => z.zone + (z.subtype ? ` (${z.subtype.toLowerCase()})` : '')).join(', ')}.${isHighRiskFloodZone(flood.worst) ? ' Includes a special flood hazard area.' : ''} Not the surveyed boundary.`
          : 'FEMA has no digital flood map for this location.',
      });
    } catch (err) {
      out.errors.push(`Flood map: ${(err as Error).message}`);
    }
    try {
      const w = await this.gis.wetlands(point, ctx);
      out.wetlands = w.types.map((t) => t.type);
      await this.upsertSystemFact(accountId, propertyId, {
        key: 'wetlands',
        value: w.types.length
          ? Array.from(new Set(w.types.map((t) => t.type))).join(', ')
          : 'None mapped',
        status: 'reported',
        source: 'USFWS National Wetlands Inventory',
        sourceUrl: w.sourceUrl,
        note: `${w.types.length ? `${w.types.length} mapped wetland feature(s)` : 'No mapped wetlands'} ${area}. A map is an indicator; only a delineation is definitive.`,
      });
    } catch (err) {
      out.errors.push(`Wetlands map: ${(err as Error).message}`);
    }
    return out;
  }

  private async upsertSystemFact(
    accountId: string,
    propertyId: string,
    f: FactInput,
  ) {
    const data = {
      value:
        f.value === null ? Prisma.JsonNull : (f.value as Prisma.InputJsonValue),
      status: f.status,
      source: f.source ?? null,
      sourceUrl: f.sourceUrl ?? null,
      note: f.note ?? null,
      observedAt: new Date(),
    };
    await this.prisma.propertyFact.upsert({
      where: { propertyId_key: { propertyId, key: f.key } },
      create: { accountId, propertyId, key: f.key, ...data },
      update: data,
    });
  }

  // ---------------------------------------------------------------- view

  /** Everything the property page shows about the asset: class, facts, diligence, what to do next. */
  async view(accountId: string, propertyId: string, dealId?: string | null) {
    const p = await this.owned(accountId, propertyId);
    const facts = await this.facts(accountId, propertyId);
    const cls = isAssetClass(p.assetClass) ? p.assetClass : null;
    const docs = dealId
      ? await this.prisma.document.findMany({
          where: { accountId, dealId, status: 'active' },
          select: { tags: true },
        })
      : [];
    const diligenceKeys = docs.flatMap((d) =>
      d.tags
        .filter((t) => t.startsWith(DILIGENCE_TAG_PREFIX))
        .map((t) => t.slice(DILIGENCE_TAG_PREFIX.length)),
    );
    const fresh = classifyProperty(PropertyIntelligenceService.inputOf(p));
    const mapping = await this.mappingFor(
      accountId,
      p.state,
      p.county,
      p.dataSource,
      p.landUse,
    );
    return {
      id: p.id,
      label: propertyLabel(p),
      assetClass: cls,
      assetSubtype: p.assetSubtype,
      basis: p.assetClassBasis,
      confidence: p.assetClassConfidence,
      reasons: p.assetClassReasons,
      setAt: p.assetClassSetAt,
      // When the record is unclassified, what the rules suggest and why.
      suggestion: cls ? null : fresh.suggestion,
      unresolved: cls ? null : fresh.unresolved,
      developmentIndicators: cls === 'land' ? fresh.developmentIndicators : [],
      providerLabels: fresh.providerLabels,
      useCode: p.landUse,
      codeMapping: mapping
        ? {
            assetClass: mapping.assetClass,
            subtype: mapping.assetSubtype,
            county: mapping.county || null,
          }
        : null,
      dataSource: p.dataSource,
      dataUpdatedAt: p.dataUpdatedAt,
      facts: factChecklist(cls, facts).map((i) => ({
        key: i.definition.key,
        label: i.definition.label,
        unit: i.definition.unit ?? null,
        type: i.definition.type,
        critical: i.definition.critical,
        settledBy: i.definition.settledBy,
        help: i.definition.help,
        status: i.status,
        value: i.record?.value ?? null,
        source: i.record?.source ?? null,
        sourceUrl: i.record?.sourceUrl ?? null,
        documentId: i.record?.documentId ?? null,
        note: i.record?.note ?? null,
        observedAt: i.record?.observedAt ?? null,
      })),
      criticalUnknowns: criticalUnknowns(cls, facts).map((d) => d.label),
      diligence: diligenceStatus(cls, facts, diligenceKeys),
      canCheckPublicRecords: p.latitude != null && p.longitude != null,
    };
  }

  private async owned(accountId: string, propertyId: string) {
    const p = await this.prisma.property.findFirst({
      where: { id: propertyId, accountId },
    });
    if (!p) throw new NotFoundException('Property not found');
    return p;
  }
}
