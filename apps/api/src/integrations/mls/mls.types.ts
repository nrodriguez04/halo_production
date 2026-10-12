/**
 * A listing as the rest of Halo sees it, whichever feed it came from. The
 * provider-specific record is kept in `raw` (sealed at rest, since it can
 * carry the listing agent's direct contact details).
 */
export interface MlsListing {
  /** Provider-unique key (RESO `ListingKey`, SimplyRETS `mlsId`). */
  listingKey: string;
  /** The MLS number people quote (RESO `ListingId`). */
  mlsId: string | null;
  /** RESO StandardStatus vocabulary: Active, Pending, Closed, Expired, Withdrawn, ... */
  status: string;
  listPrice: number | null;
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
  };
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  livingArea: number | null;
  yearBuilt: number | null;
  daysOnMarket: number | null;
  listDate: string | null;
  modifiedAt: string | null;
  listingAgent: {
    name: string | null;
    phone: string | null;
    email: string | null;
    office: string | null;
  } | null;
  /** Owner of record when the source carries it (Realie does). Public record, not contact PII. */
  ownerName?: string | null;
  raw: unknown;
}

export interface MlsSearchCriteria {
  city?: string;
  state?: string;
  postalCode?: string;
  /** Defaults to ['Active']. */
  status?: string[];
  minPrice?: number;
  maxPrice?: number;
  /** Stale listings are the wholesale signal; e.g. 90 for "on market 90+ days". */
  minDaysOnMarket?: number;
  propertyType?: string;
  /** 1..200 */
  limit?: number;
  offset?: number;
}

export interface MlsSearchResult {
  listings: MlsListing[];
  /** Total matching records when the feed reports it. */
  total: number | null;
  /** Dialect used, for provenance. */
  dialect: MlsDialect;
}

/**
 * - `bridge`: Bridge Data Output (Zillow) RESO Web API, one dataset per MLS,
 *   `access_token` auth. https://api.bridgedataoutput.com/api/v2/OData/<dataset>
 * - `reso`: any other RESO Web API endpoint (MLS Grid, Trestle, Spark, ...),
 *   bearer-token auth, base URL given in full.
 * - `simplyrets`: SimplyRETS JSON API, basic auth. Has a public demo feed,
 *   which is what the local smoke test uses.
 */
export type MlsDialect = 'bridge' | 'reso' | 'simplyrets';

export interface MlsConfig {
  dialect: MlsDialect;
  baseUrl: string;
  /** Bridge only: the MLS dataset name in the path. */
  dataset?: string;
  token?: string;
  username?: string;
  password?: string;
}
