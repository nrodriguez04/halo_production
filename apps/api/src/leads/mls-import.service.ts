import { Injectable, Logger } from '@nestjs/common';
import type { CSVImportRow } from '@halo/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LeadsService } from './leads.service';
import { MlsService } from '../integrations/mls/mls.service';
import type {
  MlsListing,
  MlsSearchCriteria,
} from '../integrations/mls/mls.types';
import { sealJson } from '../pii/contact-crypto';
import { normalizeAddress } from '@halo/shared';

export interface MlsImportResult {
  searched: number;
  total: number | null;
  created: number;
  duplicates: number;
  errors: string[];
  dialect: string;
}

/**
 * Turns an MLS search into leads. The listing becomes the lead's canonical
 * address; the seller is not in the feed (only the listing agent is), so no
 * contact fields are set and the usual enrichment / skip-trace path fills
 * them later. Each new lead gets a `source_records` row with the listing
 * sealed (the agent's direct phone and email are in it) and the
 * non-contact facts in the clear, plus `mls` tags for filtering.
 *
 * Dedupe reuses importCSV's (zip, normalized address) check, so re-running
 * the same search is safe: existing leads are reported as duplicates, not
 * recreated.
 */
@Injectable()
export class MlsImportService {
  private readonly logger = new Logger(MlsImportService.name);

  constructor(
    private prisma: PrismaService,
    private leads: LeadsService,
    private mls: MlsService,
  ) {}

  async importListings(
    criteria: MlsSearchCriteria,
    accountId: string,
    userId: string,
  ): Promise<MlsImportResult> {
    const search = await this.mls.searchListings(criteria, {
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
      notes: describe(l),
    }));

    const imported = await this.leads.importCSV(rows, accountId, userId);

    // importCSV uses createMany (no ids back); find the leads these rows
    // produced or matched by the same key it deduped on, then attach the
    // provenance row and tags. Leads that already had an mls source record
    // for this listing key are left alone.
    const attached = await this.attachSourceRecords(accountId, usable);

    this.logger.log(
      `MLS import for ${accountId}: ${usable.length} listings, ${imported.created} new leads, ${attached} source records`,
    );
    return {
      searched: search.listings.length,
      total: search.total,
      created: imported.created,
      duplicates: imported.duplicates,
      errors: imported.errors,
      dialect: search.dialect,
    };
  }

  private async attachSourceRecords(
    accountId: string,
    listings: MlsListing[],
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
          provider: 'mls',
          requestHash: listing.listingKey,
        },
        select: { id: true },
      });
      if (existing) continue;

      await this.prisma.sourceRecord.create({
        data: {
          leadId: lead.id,
          provider: 'mls',
          endpoint: 'Property',
          requestHash: listing.listingKey,
          // The listing agent's direct contacts live in the raw record.
          response: sealJson(listing.raw, {
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
          trustWeight: 0.9,
        },
      });

      const tags = new Set(lead.tags);
      tags.add('mls');
      tags.add(`mls:${listing.status.toLowerCase().replace(/\s+/g, '_')}`);
      if ((listing.daysOnMarket ?? 0) >= 90) tags.add('stale_listing');
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

function describe(l: MlsListing): string {
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
  return `MLS listing: ${bits.join(' · ')}`;
}
