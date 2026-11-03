/**
 * What every agent reads about the asset (docs/asset-classes.md): its
 * class, the parcel's identity and size, and each property fact with how
 * it is known. A fact's status travels with it so a reply can say
 * "reported, not verified" instead of stating it as settled, and a fact
 * that is not here is unknown: the prompts forbid filling it in.
 */
export const ASSET_PROPERTY_SELECT = {
  apn: true,
  county: true,
  assetClass: true,
  assetSubtype: true,
  acres: true,
  buildingSqft: true,
  units: true,
  zoning: true,
  facts: {
    select: { key: true, value: true, status: true, source: true },
  },
} as const;

export interface AssetPropertyFields {
  apn?: string | null;
  county?: string | null;
  /** residential | land | commercial; null while unclassified. */
  assetClass?: string | null;
  assetSubtype?: string | null;
  acres?: number | null;
  buildingSqft?: number | null;
  units?: number | null;
  zoning?: string | null;
  facts?: Array<{
    key: string;
    value: unknown;
    status: string;
    source: string | null;
  }>;
}
