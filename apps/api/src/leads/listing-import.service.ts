import { Injectable, Logger } from '@nestjs/common';
import type { CSVImportRow } from '@halo/shared';
import { normalizeAddress } from '@halo/shared';
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

export interface ListingImportResult {
  source: ListingSource;
  /** Provenance detail: the MLS dialect, or the vendor endpoint. */
  feed: string;
  searched: number;
  total: number | null;
  created: number;
  duplicates: number;
  errors: string[];
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

  private async attachSourceRecords(
    source: ListingSource,
    accountId: string,
    listings: Listing[],
  ): Promise<number> {
    if (listings.length === 0) return 0;
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

    let attached = 0;
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
          response: sealJson(listing.raw, {
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
          }) as Prisma.InputJsonObject,
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
