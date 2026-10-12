import { BadRequestException, Injectable } from '@nestjs/common';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { RealieService } from '../realie/realie.service';
import type { RealieProperty } from '../realie/realie.types';
import type {
  Listing,
  ListingSearchCriteria,
  ListingSearchResult,
  ListingSourceAdapter,
} from './listing-source.types';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const PAGE = 100;
/** Hard stop per import: at most this many Realie tokens. */
const MAX_PAGES = 5;

export const REALIE_OWNER_FILTERS = [
  'Absentee',
  'Owner-occupied',
  'Any',
] as const;
type OwnerFilter = (typeof REALIE_OWNER_FILTERS)[number];

/**
 * Realie county records as a lead source. County data has no listing
 * status, so the "status" criterion is an owner filter instead: absentee
 * owners (mailing address elsewhere) are the wholesale list, and
 * `transferredWithinDays` narrows to recent sales. Each page of up to 100
 * parcels costs one Realie token; a search that matches nothing is free.
 */
@Injectable()
export class RealieLeadsAdapter implements ListingSourceAdapter {
  readonly source = 'realie' as const;
  readonly statuses = REALIE_OWNER_FILTERS;

  constructor(private realie: RealieService) {}

  async search(
    criteria: ListingSearchCriteria,
    ctx: CostContext,
  ): Promise<ListingSearchResult> {
    const state = criteria.state?.trim();
    if (!state) {
      throw new BadRequestException('Realie searches need a two-letter state');
    }
    const limit = Math.min(
      Math.max(criteria.limit ?? DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    const filter = ownerFilter(criteria.status?.[0]);

    const listings: Listing[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES && listings.length < limit; page++) {
      const result = await this.realie.searchProperties(
        {
          state,
          city: criteria.city,
          zipCode: criteria.postalCode,
          residential: true,
          transferredWithinDays: criteria.transferredWithinDays,
          // A filtered pull reads full pages so one token yields as many
          // matches as possible.
          limit:
            filter === 'Any' ? Math.min(PAGE, limit - listings.length) : PAGE,
          cursor,
        },
        ctx,
      );
      for (const property of result.properties) {
        if (!matches(property, filter)) continue;
        listings.push(toListing(property, criteria));
        if (listings.length >= limit) break;
      }
      if (!result.nextCursor) break;
      cursor = result.nextCursor;
    }
    return {
      source: 'realie',
      feed: 'public/property/search',
      listings,
      total: null,
    };
  }
}

function ownerFilter(requested?: string): OwnerFilter {
  if (!requested) return 'Absentee';
  if (/^absentee/i.test(requested)) return 'Absentee';
  if (/^owner/i.test(requested)) return 'Owner-occupied';
  return 'Any';
}

function matches(p: RealieProperty, filter: OwnerFilter): boolean {
  if (filter === 'Any') return true;
  return filter === 'Absentee'
    ? p.owner.occupied === false
    : p.owner.occupied === true;
}

/** A parcel in the common listing shape; the wholesale signals ride along as tags. */
export function toListing(
  p: RealieProperty,
  criteria: ListingSearchCriteria,
): Listing {
  const signals: string[] = [];
  if (p.owner.occupied === false) signals.push('owner:absentee');
  else if (p.owner.occupied === true) signals.push('owner:occupied');
  if (p.distress.taxStatus === 'delinquent') signals.push('tax:delinquent');
  if (p.distress.foreclosure) signals.push('foreclosure');
  if (p.distress.lienCount > 0) signals.push('lien');
  if (p.lastSale?.distressed) signals.push('distressed_sale');
  if (criteria.transferredWithinDays != null) signals.push('recent_transfer');

  const status =
    p.owner.occupied === false
      ? 'Absentee'
      : p.owner.occupied === true
        ? 'Owner-occupied'
        : 'Public record';
  const money = (n: number) => `$${n.toLocaleString('en-US')}`;
  const summary = [
    status === 'Public record'
      ? 'county record'
      : `${status.toLowerCase()} owner`,
    p.distress.taxStatus === 'delinquent' ? 'tax delinquent' : null,
    p.distress.foreclosure ? 'foreclosure on file' : null,
    p.distress.lienCount > 0 ? `${p.distress.lienCount} lien(s)` : null,
    p.values.market != null ? `market value ${money(p.values.market)}` : null,
    p.lastSale?.date
      ? `last sale ${p.lastSale.date}${
          p.lastSale.price != null ? ` ${money(p.lastSale.price)}` : ''
        }`
      : null,
    p.building.yearBuilt != null ? `built ${p.building.yearBuilt}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return {
    listingKey:
      p.realieParcelId ||
      p.parcelId ||
      `${p.address.street}|${p.address.postalCode}`,
    mlsId: null,
    status,
    listPrice: null,
    address: {
      street: [p.address.street, p.address.unit].filter(Boolean).join(' '),
      city: p.address.city,
      state: p.address.state,
      postalCode: p.address.postalCode,
    },
    propertyType: p.building.useCode,
    bedrooms: p.building.bedrooms,
    bathrooms: p.building.bathrooms,
    livingArea: p.building.livingArea,
    yearBuilt: p.building.yearBuilt,
    daysOnMarket: null,
    listDate: null,
    modifiedAt: null,
    listingAgent: null,
    ownerName: p.owner.name,
    signals,
    summary,
    raw: p.raw,
  };
}
