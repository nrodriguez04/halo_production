import { Injectable, Logger, Optional } from '@nestjs/common';
import type { CSVImportRow } from '@halo/shared';
import {
  classifyProperty,
  improvementStatus,
  matchesCriteria,
  normalizeAddress,
  parcelKey,
  type AssetClass,
  type AssetClassification,
  type ClassificationInput,
  type ParcelCandidate,
} from '@halo/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LeadsService } from './leads.service';
import { ListingSourceService } from '../integrations/listings/listing-source.service';
import type {
  Listing,
  ListingSearchCriteria,
  ListingSource,
} from '../integrations/listings/listing-source.types';
import { sealJson } from '../pii/contact-crypto';
import { PropertyIntelligenceService } from '../assets/property-intelligence.service';

export interface ListingImportResult {
  source: ListingSource;
  /** Provenance detail: the MLS dialect, or the vendor endpoint. */
  feed: string;
  searched: number;
  total: number | null;
  created: number;
  duplicates: number;
  errors: string[];
  /** Asset-class pulls only (docs/asset-classes.md s3). */
  filtered?: number;
  /** Why records were left out, with counts. */
  filteredReasons?: Record<string, number>;
  /** Kept but unclassified: a person confirms what they are. */
  unclassified?: number;
  byClass?: Partial<Record<AssetClass, number>>;
}

export const LISTING_SOURCE_LABEL: Record<ListingSource, string> = {
  mls: 'MLS',
  rentcast: 'RentCast',
  realie: 'Realie',
};

/** `source_records.endpoint` per source: what was queried, in the vendor's own terms. */
const SOURCE_ENDPOINT: Record<ListingSource, string> = {
  mls: 'Property',
  rentcast: 'listings/sale',
  realie: 'public/property/search',
};

/** Licensed MLS data outranks public-record and aggregator copies of it. */
const SOURCE_TRUST: Record<ListingSource, number> = {
  mls: 0.9,
  rentcast: 0.8,
  realie: 0.85,
};

/** Sources whose records are listings; county records carry owner signals instead. */
const LISTING_FEEDS: ReadonlySet<ListingSource> = new Set(['mls', 'rentcast']);

/** Days on market at which a listing is tagged `stale_listing`. */
export const STALE_LISTING_DAYS = 90;

/**
 * Turns a listing search, from any source, into leads. The listing becomes
 * the lead's canonical address and, when the source knows it, the owner of
 * record; seller contacts are never in a listing feed (only the listing
 * agent's are), so the usual enrichment / skip-trace path fills them later.
 * Each new lead gets a `source_records` row with the raw listing sealed (the
 * agent's direct phone and email are in it) and the non-contact facts in the
 * clear, plus `source:<source>`, `listing:<status>` and `stale_listing` tags.
 *
 * Dedupe reuses importCSV's (zip, normalized address) check, so re-running
 * the same search is safe: existing leads are reported as duplicates, not
 * recreated, and a listing already attached to a lead is not attached twice.
 */
@Injectable()
export class ListingImportService {
  private readonly logger = new Logger(ListingImportService.name);

  constructor(
    private prisma: PrismaService,
    private leads: LeadsService,
    private sources: ListingSourceService,
    @Optional() private intelligence?: PropertyIntelligenceService,
  ) {}

  async importListings(
    source: ListingSource,
    criteria: ListingSearchCriteria,
    accountId: string,
    userId: string,
  ): Promise<ListingImportResult> {
    const search = await this.sources.search(source, criteria, {
      accountId,
      actor: 'user',
      userId,
    });
    if (criteria.assetClasses?.length && this.intelligence) {
      return this.importByAssetClass(
        source,
        criteria,
        accountId,
        userId,
        search,
      );
    }

    const usable = search.listings.filter(
      (l) => l.address.street && l.address.postalCode,
    );
    const rows: CSVImportRow[] = usable.map((l) => ({
      address: l.address.street,
      city: l.address.city || undefined,
      state: l.address.state || undefined,
      zip: l.address.postalCode,
      owner: l.ownerName || undefined,
      notes: describe(source, l),
    }));

    // Tagged with the feed from the start: the funnel reads a lead's first
    // `source:` tag, and these used to be counted as CSV imports.
    const imported = await this.leads.importCSV(rows, accountId, userId, {
      source,
    });

    // importCSV uses createMany (no ids back); find the leads these rows
    // produced or matched by the same key it deduped on, then attach the
    // provenance row and tags.
    const attached = await this.attachSourceRecords(source, accountId, usable);

    this.logger.log(
      `${LISTING_SOURCE_LABEL[source]} import for ${accountId}: ${usable.length} listings, ${imported.created} new leads, ${attached} source records`,
    );
    return {
      source,
      feed: search.feed,
      searched: search.listings.length,
      total: search.total,
      created: imported.created,
      duplicates: imported.duplicates,
      errors: imported.errors,
    };
  }

  /**
   * An asset-class pull (docs/asset-classes.md s3). Each record is
   * classified from what it is, kept only when it fits one of the market's
   * classes and that class's filters, and deduplicated by parcel (state,
   * county, APN) before address, so overlapping markets and sources never
   * make a second lead for the same parcel. A parcel with no street address
   * becomes a lead identified by its APN and county.
   */
  private async importByAssetClass(
    source: ListingSource,
    criteria: ListingSearchCriteria,
    accountId: string,
    userId: string,
    search: Awaited<ReturnType<ListingSourceService['search']>>,
  ): Promise<ListingImportResult> {
    const classes = criteria.assetClasses!;
    const now = new Date();
    const filteredReasons: Record<string, number> = {};
    const byClass: Partial<Record<AssetClass, number>> = {};
    const errors: string[] = [];
    let unclassified = 0;
    const kept: Array<{
      listing: Listing;
      cls: AssetClass;
      classification: AssetClassification;
      key: string | null;
    }> = [];

    const mappings = await this.prisma.assetCodeMapping.findMany({
      where: { accountId, state: (criteria.state ?? '').toUpperCase() },
    });
    for (const listing of search.listings) {
      const parcel = listing.parcel;
      const state = (
        listing.address.state ||
        criteria.state ||
        ''
      ).toUpperCase();
      const input: ClassificationInput = {
        labels: [listing.propertyType, parcel?.landUse].filter(
          (l, i, a) => l && a.indexOf(l) === i,
        ),
        acres: parcel?.acres,
        lotSqft: parcel?.lotSqft,
        buildingSqft: parcel?.buildingSqft ?? listing.livingArea,
        units: parcel?.units,
        yearBuilt: parcel?.yearBuilt ?? listing.yearBuilt,
        improvementValue: parcel?.improvementValue,
        residentialFlag: parcel?.residentialFlag,
        hasStructure: parcel?.hasStructure,
      };
      let classification = classifyProperty(input);
      const code = parcel?.landUse;
      const mapping = code
        ? mappings.find(
            (m) => m.code === code && (!m.provider || m.provider === source),
          )
        : null;
      if (mapping) {
        classification = {
          ...classification,
          assetClass: mapping.assetClass as AssetClass,
          subtype:
            (mapping.assetSubtype as AssetClassification['subtype']) ?? null,
          confidence: 'high',
          unresolved: null,
          suggestion: null,
          reasons: [`use code "${code}" confirmed as ${mapping.assetClass}`],
        };
      }
      const candidate: ParcelCandidate = {
        state,
        county: parcel?.county ?? null,
        apn: parcel?.apn ?? null,
        acres:
          parcel?.acres ?? (parcel?.lotSqft ? parcel.lotSqft / 43_560 : null),
        buildingSqft: input.buildingSqft ?? null,
        units: parcel?.units ?? null,
        yearBuilt: input.yearBuilt ?? null,
        landUse: parcel?.landUse ?? listing.propertyType ?? null,
        assessedValue: parcel?.assessedValue ?? null,
        lastSaleDate: parcel?.lastSaleDate ?? null,
        absentee: parcel?.absentee ?? null,
        taxDelinquent: parcel?.taxDelinquent ?? null,
        lienCount: parcel?.lienCount ?? null,
        foreclosure: parcel?.foreclosure ?? null,
        ownerKind: parcel?.ownerKind ?? null,
        classification,
        improved: improvementStatus(input),
      };
      let match: { cls: AssetClass; reason: string | null } | null = null;
      let firstReason: string | null = null;
      for (const cls of classes) {
        if (cls === 'residential') {
          // The residential pull keeps what it always kept, minus what is
          // plainly land or commercial.
          const other =
            classification.assetClass &&
            classification.assetClass !== 'residential';
          if (!other) {
            match = {
              cls,
              reason: classification.assetClass
                ? null
                : classification.unresolved,
            };
            break;
          }
          firstReason ??= `classified as ${classification.assetClass}`;
          continue;
        }
        const v = matchesCriteria(
          candidate,
          cls,
          cls === 'land' ? criteria.land : criteria.commercial,
          now,
        );
        if (v.keep) {
          match = { cls, reason: v.reason };
          break;
        }
        firstReason ??= v.reason;
      }
      if (!match) {
        const why = firstReason ?? 'did not match';
        filteredReasons[why] = (filteredReasons[why] ?? 0) + 1;
        continue;
      }
      if (!classification.assetClass) unclassified++;
      byClass[match.cls] = (byClass[match.cls] ?? 0) + 1;
      kept.push({
        listing,
        cls: match.cls,
        classification,
        key: parcelKey(state, parcel?.county, parcel?.apn),
      });
    }

    // Parcels already on file, from any market or source.
    const keys = kept.map((k) => k.key).filter((k): k is string => !!k);
    const known = keys.length
      ? await this.prisma.property.findMany({
          where: { accountId, parcelKey: { in: keys } },
          select: { parcelKey: true, leadId: true },
        })
      : [];
    const knownKeys = new Set(known.map((k) => k.parcelKey));
    let duplicates = 0;
    const fresh: typeof kept = [];
    const seen = new Set<string>();
    for (const k of kept) {
      if (k.key && (knownKeys.has(k.key) || seen.has(k.key))) {
        duplicates++;
        continue;
      }
      if (k.key) seen.add(k.key);
      fresh.push(k);
    }

    // Addressed records go through the CSV path (address dedupe, as before);
    // a parcel with no address is created directly, keyed by its APN.
    const addressed = fresh.filter(
      (k) => k.listing.address.street && k.listing.address.postalCode,
    );
    const parcelsOnly = fresh.filter(
      (k) =>
        !(k.listing.address.street && k.listing.address.postalCode) && k.key,
    );
    const dropped = fresh.length - addressed.length - parcelsOnly.length;
    if (dropped > 0)
      filteredReasons['no address and no APN with county'] = dropped;

    const imported = await this.leads.importCSV(
      addressed.map(({ listing: l }) => ({
        address: l.address.street,
        city: l.address.city || undefined,
        state: l.address.state || undefined,
        zip: l.address.postalCode,
        owner: l.ownerName || undefined,
        notes: describe(source, l),
      })),
      accountId,
      userId,
      { source },
    );
    errors.push(...imported.errors);
    let created = imported.created;
    duplicates += imported.duplicates;

    const leadFor = new Map<Listing, string>();
    for (const k of parcelsOnly) {
      const l = k.listing;
      const lead = await this.prisma.lead.create({
        data: {
          accountId,
          canonicalAddress: null,
          canonicalCity: l.address.city || null,
          canonicalState:
            (l.address.state || criteria.state || '').toUpperCase() || null,
          canonicalZip: l.address.postalCode || null,
          canonicalOwner: l.ownerName || null,
          status: 'new',
          tags: [`source:${source}`],
        },
        select: { id: true },
      });
      leadFor.set(l, lead.id);
      created++;
    }
    await this.attachSourceRecords(
      source,
      accountId,
      addressed.map((k) => k.listing),
      leadFor,
      parcelsOnly.map((k) => k.listing),
    );

    // The parcel itself: facts, classification, and the asset tags the
    // leads list filters on.
    const addressedLeads = addressed.length
      ? await this.prisma.lead.findMany({
          where: {
            accountId,
            canonicalZip: {
              in: Array.from(
                new Set(addressed.map((k) => k.listing.address.postalCode)),
              ),
            },
          },
          select: { id: true, canonicalAddress: true, canonicalZip: true },
        })
      : [];
    const byAddress = new Map(
      addressedLeads
        .filter((l) => l.canonicalAddress)
        .map((l) => [
          key(
            l.canonicalZip ?? '',
            l.canonicalAddress!,
            l.canonicalZip ?? undefined,
          ),
          l.id,
        ]),
    );
    for (const k of [...addressed, ...parcelsOnly]) {
      const l = k.listing;
      const leadId =
        leadFor.get(l) ??
        byAddress.get(
          key(l.address.postalCode, l.address.street, l.address.postalCode),
        ) ??
        null;
      if (!leadId) continue;
      try {
        if (l.parcel) {
          await this.intelligence!.upsertParcel(
            accountId,
            leadId,
            {
              street: l.address.street || null,
              city: l.address.city || null,
              state: (l.address.state || criteria.state || '').toUpperCase(),
              zip: l.address.postalCode || null,
            },
            {
              ...l.parcel,
              labels: [l.propertyType, l.parcel.landUse],
              zoning: null,
              source,
            },
          );
        }
        const tags = [
          k.classification.assetClass
            ? `asset:${k.classification.assetClass}`
            : 'asset:unclassified',
          ...(k.classification.subtype
            ? [`asset:${k.classification.subtype}`]
            : []),
        ];
        const lead = await this.prisma.lead.findUnique({
          where: { id: leadId },
          select: { tags: true },
        });
        await this.prisma.lead.update({
          where: { id: leadId },
          data: { tags: Array.from(new Set([...(lead?.tags ?? []), ...tags])) },
        });
      } catch (err) {
        errors.push(
          `${l.parcel?.apn ?? l.address.street}: ${(err as Error).message}`,
        );
      }
    }

    const filtered = Object.values(filteredReasons).reduce((s, n) => s + n, 0);
    this.logger.log(
      `${LISTING_SOURCE_LABEL[source]} ${classes.join('+')} import for ${accountId}: ${search.listings.length} records, ${filtered} filtered, ${created} new leads, ${duplicates} duplicates`,
    );
    return {
      source,
      feed: search.feed,
      searched: search.listings.length,
      total: search.total,
      created,
      duplicates,
      errors,
      filtered,
      filteredReasons,
      unclassified,
      byClass,
    };
  }

  private async attachSourceRecords(
    source: ListingSource,
    accountId: string,
    listings: Listing[],
    leadFor: Map<Listing, string> = new Map(),
    parcelListings: Listing[] = [],
  ): Promise<number> {
    let attached = 0;
    for (const listing of parcelListings) {
      const leadId = leadFor.get(listing);
      if (!leadId) continue;
      await this.prisma.sourceRecord.create({
        data: {
          leadId,
          provider: source,
          endpoint: SOURCE_ENDPOINT[source],
          requestHash: listing.listingKey,
          response: sealJson(
            listing.raw,
            provenance(source, listing),
          ) as Prisma.InputJsonObject,
          trustWeight: SOURCE_TRUST[source],
        },
      });
      attached++;
    }
    if (listings.length === 0) return attached;
    const zips = Array.from(new Set(listings.map((l) => l.address.postalCode)));
    const leads = await this.prisma.lead.findMany({
      where: { accountId, canonicalZip: { in: zips } },
      select: {
        id: true,
        canonicalAddress: true,
        canonicalZip: true,
        tags: true,
      },
    });
    const byKey = new Map<string, (typeof leads)[number]>();
    for (const lead of leads) {
      if (!lead.canonicalAddress) continue;
      byKey.set(
        key(
          lead.canonicalZip ?? '',
          lead.canonicalAddress,
          lead.canonicalZip ?? undefined,
        ),
        lead,
      );
    }

    for (const listing of listings) {
      const lead = byKey.get(
        key(
          listing.address.postalCode,
          listing.address.street,
          listing.address.postalCode,
        ),
      );
      if (!lead) continue;

      const existing = await this.prisma.sourceRecord.findFirst({
        where: {
          leadId: lead.id,
          provider: source,
          requestHash: listing.listingKey,
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.sourceRecord.create({
        data: {
          leadId: lead.id,
          provider: source,
          endpoint: SOURCE_ENDPOINT[source],
          requestHash: listing.listingKey,
          // The listing agent's direct contacts live in the raw record.
          response: sealJson(
            listing.raw,
            provenance(source, listing),
          ) as Prisma.InputJsonObject,
          trustWeight: SOURCE_TRUST[source],
        },
      });

      const tags = new Set(lead.tags);
      tags.add(`source:${source}`);
      if (LISTING_FEEDS.has(source)) {
        tags.add(`listing:${slug(listing.status)}`);
      }
      for (const signal of listing.signals ?? []) tags.add(signal);
      if ((listing.daysOnMarket ?? 0) >= STALE_LISTING_DAYS) {
        tags.add('stale_listing');
      }
      await this.prisma.lead.update({
        where: { id: lead.id },
        data: { tags: Array.from(tags) },
      });
      attached++;
    }
    return attached;
  }
}

/** The non-contact facts kept in the clear beside the sealed raw record. */
function provenance(source: ListingSource, listing: Listing) {
  return {
    source,
    listingKey: listing.listingKey,
    mlsId: listing.mlsId,
    status: listing.status,
    listPrice: listing.listPrice,
    daysOnMarket: listing.daysOnMarket,
    propertyType: listing.propertyType,
    bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms,
    livingArea: listing.livingArea,
    yearBuilt: listing.yearBuilt,
    listDate: listing.listDate,
    city: listing.address.city,
    postalCode: listing.address.postalCode,
    ...(listing.parcel
      ? {
          apn: listing.parcel.apn,
          county: listing.parcel.county,
          acres: listing.parcel.acres,
          landUse: listing.parcel.landUse,
        }
      : {}),
  };
}

function key(zip: string, address: string, zipForNormalize?: string): string {
  return `${zip.trim()}|${normalizeAddress(address, undefined, undefined, zipForNormalize).toLowerCase()}`;
}

function slug(status: string): string {
  return status.toLowerCase().replace(/\s+/g, '_');
}

function describe(source: ListingSource, l: Listing): string {
  if (l.summary) return `${LISTING_SOURCE_LABEL[source]} record: ${l.summary}`;
  const bits = [
    l.mlsId ? `MLS# ${l.mlsId}` : null,
    l.status,
    l.listPrice != null ? `$${l.listPrice.toLocaleString('en-US')}` : null,
    l.daysOnMarket != null ? `${l.daysOnMarket} DOM` : null,
    l.propertyType,
    l.bedrooms != null ? `${l.bedrooms}bd` : null,
    l.bathrooms != null ? `${l.bathrooms}ba` : null,
    l.livingArea != null ? `${l.livingArea} sqft` : null,
  ].filter(Boolean);
  return `${LISTING_SOURCE_LABEL[source]} listing: ${bits.join(' · ')}`;
}
