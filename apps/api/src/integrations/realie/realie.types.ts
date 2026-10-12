/**
 * A Realie parcel record as the rest of Halo sees it. Realie serves two
 * response shapes (nested v3, flat v2-compatible) chosen per account; the
 * normalizer reads both into this one. See docs/integrations/listing-sources.md.
 */
export interface RealieProperty {
  /** Stable Realie identifier; the property key. */
  realieParcelId: string;
  /** Assessor's parcel number. */
  parcelId: string | null;
  address: {
    street: string;
    unit: string | null;
    city: string;
    state: string;
    postalCode: string;
    county: string | null;
  };
  latitude: number | null;
  longitude: number | null;
  owner: {
    name: string | null;
    name2: string | null;
    /** True when the owner's mailing address is the property; null when Realie does not say. */
    occupied: boolean | null;
    mailingAddress: string | null;
    mailingCity: string | null;
    mailingState: string | null;
    mailingZip: string | null;
  };
  values: {
    market: number | null;
    assessed: number | null;
    /** Realie's own model estimate when present. */
    estimate: number | null;
  };
  lastSale: {
    date: string | null;
    price: number | null;
    /** Distressed sale or REO on the most recent transfer. */
    distressed: boolean;
  } | null;
  building: {
    yearBuilt: number | null;
    bedrooms: number | null;
    bathrooms: number | null;
    livingArea: number | null;
    lotAcres: number | null;
    useCode: string | null;
    residential: boolean | null;
  };
  distress: {
    /** 'current' | 'exempt' | 'delinquent' | 'not_available' when present. */
    taxStatus: string | null;
    lienCount: number;
    foreclosure: boolean;
    mortgageCount: number;
  };
  raw: unknown;
}

export interface RealieSearchParams {
  /** Two-letter state; Realie requires it. */
  state: string;
  city?: string;
  zipCode?: string;
  county?: string;
  residential?: boolean;
  /** Only parcels transferred within the last N days. */
  transferredWithinDays?: number;
  /** 1..100 per page. */
  limit?: number;
  /** `metadata.nextCursor` from the previous page; omitted for the first page. */
  cursor?: string;
}

export interface RealieSearchPage {
  properties: RealieProperty[];
  nextCursor: string | null;
}

export interface RealieAddressQuery {
  /** Street line only, e.g. "123 Main St". */
  address: string;
  state: string;
  unit?: string;
  /** Realie requires county whenever city is given. */
  city?: string;
  county?: string;
}
