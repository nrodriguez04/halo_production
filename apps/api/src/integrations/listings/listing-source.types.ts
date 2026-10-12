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
};

export type ListingSearchCriteria = MlsSearchCriteria & {
  /** Realie: only parcels transferred within the last N days. */
  transferredWithinDays?: number;
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
