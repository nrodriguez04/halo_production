import type {
  AssetClass,
  CommercialCriteria,
  LandCriteria,
} from '@halo/shared';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import type { MlsListing, MlsSearchCriteria } from '../mls/mls.types';

/**
 * Where leads can be pulled from. `mls` is a licensed RESO feed (needs an
 * MLS invite); `rentcast` is an aggregator of active and removed listings;
 * `realie` is county records (owner of record, values, liens, tax status),
 * which carry no listing status at all. See docs/integrations/listing-sources.md.
 */
export const LISTING_SOURCES = ['mls', 'rentcast', 'realie'] as const;
export type ListingSource = (typeof LISTING_SOURCES)[number];

/**
 * One normalized record, whichever source produced it. Listing feeds fill
 * the listing fields; county records add owner `signals` (tags such as
 * `owner:absentee`, `tax:delinquent`) and a one-line `summary`.
 */
export type Listing = MlsListing & {
  signals?: string[];
  summary?: string;
  /** The parcel facts a county-record or aggregator source returned (docs/asset-classes.md s3). */
  parcel?: ListingParcel;
};

/**
 * What a source says about the parcel itself, as returned. Only fields the
 * adapter actually reads from the vendor are filled; the rest stay null.
 */
export interface ListingParcel {
  apn: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  acres: number | null;
  lotSqft: number | null;
  /** Living area for a home; the only building area these sources give. */
  livingSqft: number | null;
  buildingSqft: number | null;
  units: number | null;
  yearBuilt: number | null;
  /** The county use code or the source's type label, as given. */
  landUse: string | null;
  residentialFlag: boolean | null;
  hasStructure: boolean | null;
  improvementValue: number | null;
  assessedValue: number | null;
  marketValue: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  absentee: boolean | null;
  taxDelinquent: boolean | null;
  lienCount: number | null;
  foreclosure: boolean | null;
  ownerKind: string | null;
}

export type ListingSearchCriteria = MlsSearchCriteria & {
  /** Realie: only parcels transferred within the last N days. */
  transferredWithinDays?: number;
  /**
   * The asset classes the pull is for. Absent: the residential pull Halo
   * has always made. Realie is asked for residential or non-residential
   * parcels accordingly; land and commercial are told apart by Halo.
   */
  assetClasses?: AssetClass[];
  land?: LandCriteria;
  commercial?: CommercialCriteria;
};

export interface ListingSearchResult {
  source: ListingSource;
  /** Provenance detail: the MLS dialect, or the vendor endpoint. */
  feed: string;
  listings: Listing[];
  /** Total matches when the source reports it. */
  total: number | null;
}

export interface ListingSourceAdapter {
  readonly source: ListingSource;
  /** The `status` vocabulary the source understands; the first is its default. */
  readonly statuses: readonly string[];
  search(
    criteria: ListingSearchCriteria,
    ctx: CostContext,
  ): Promise<ListingSearchResult>;
}
