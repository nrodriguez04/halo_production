/**
 * What kind of real estate a property is (docs/asset-classes.md). Three
 * classes, each with subtypes. The lists are data: adding a subtype is one
 * line here plus its label, and nothing downstream switches on a closed set
 * it cannot extend.
 *
 * A property with no class is unclassified, not residential. Halo used to
 * treat every record as a house; a parcel nobody has classified now stays
 * unclassified until the rules or a person settle it.
 */

export const ASSET_CLASSES = ['residential', 'land', 'commercial'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export const ASSET_CLASS_LABEL: Record<AssetClass, string> = {
  residential: 'Residential',
  land: 'Land',
  commercial: 'Commercial',
};

export const ASSET_SUBTYPES = {
  residential: ['single_family', 'condo_townhome', 'small_multifamily', 'manufactured'],
  land: [
    'residential_lot',
    'infill_lot',
    'rural_acreage',
    'agricultural',
    'recreational',
    'commercial_land',
    'development_parcel',
    'subdividable',
  ],
  commercial: [
    'multifamily',
    'retail',
    'office',
    'industrial',
    'mixed_use',
    'self_storage',
    'flex',
    'hospitality',
    'other_commercial',
  ],
} as const satisfies Record<AssetClass, readonly string[]>;

export type ResidentialSubtype = (typeof ASSET_SUBTYPES.residential)[number];
export type LandSubtype = (typeof ASSET_SUBTYPES.land)[number];
export type CommercialSubtype = (typeof ASSET_SUBTYPES.commercial)[number];
export type AssetSubtype = ResidentialSubtype | LandSubtype | CommercialSubtype;

export const ASSET_SUBTYPE_LABEL: Record<AssetSubtype, string> = {
  single_family: 'Single-family home',
  condo_townhome: 'Condo or townhome',
  small_multifamily: 'Duplex to fourplex',
  manufactured: 'Manufactured home',
  residential_lot: 'Vacant residential lot',
  infill_lot: 'Infill lot',
  rural_acreage: 'Rural acreage',
  agricultural: 'Agricultural land',
  recreational: 'Recreational land',
  commercial_land: 'Undeveloped commercial land',
  development_parcel: 'Development parcel',
  subdividable: 'Subdividable land',
  multifamily: 'Multifamily (5+ units)',
  retail: 'Retail',
  office: 'Office',
  industrial: 'Industrial or warehouse',
  mixed_use: 'Mixed use',
  self_storage: 'Self-storage',
  flex: 'Flex space',
  hospitality: 'Hospitality',
  other_commercial: 'Other commercial',
};

/**
 * Subtypes the rules never assign. Each is a judgement about what a parcel
 * could become (infill, development, subdivision), so only a person sets it;
 * the classifier reports the indicators instead.
 */
export const OPERATOR_ONLY_SUBTYPES: readonly AssetSubtype[] = ['infill_lot', 'development_parcel', 'subdividable'];

export function isAssetClass(v: unknown): v is AssetClass {
  return typeof v === 'string' && (ASSET_CLASSES as readonly string[]).includes(v);
}

export function subtypesOf(c: AssetClass): readonly AssetSubtype[] {
  return ASSET_SUBTYPES[c];
}

/** The class a subtype belongs to, or null for an unknown subtype. */
export function classOfSubtype(s: string | null | undefined): AssetClass | null {
  if (!s) return null;
  for (const c of ASSET_CLASSES) if ((ASSET_SUBTYPES[c] as readonly string[]).includes(s)) return c;
  return null;
}

/** True when the subtype exists and belongs to the class. */
export function isSubtypeOf(c: AssetClass, s: string | null | undefined): s is AssetSubtype {
  return !!s && (ASSET_SUBTYPES[c] as readonly string[]).includes(s);
}

/** "Land: Rural acreage", "Commercial", or "Unclassified". */
export function assetLabel(c: string | null | undefined, s?: string | null): string {
  if (!isAssetClass(c)) return 'Unclassified';
  return isSubtypeOf(c, s) ? `${ASSET_CLASS_LABEL[c]}: ${ASSET_SUBTYPE_LABEL[s]}` : ASSET_CLASS_LABEL[c];
}

export const SQFT_PER_ACRE = 43_560;
