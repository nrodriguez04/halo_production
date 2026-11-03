import { z } from 'zod';
import type { AssetClassification } from './classify';
import { normalizeApn, normalizeCounty } from './parcel';
import { ASSET_CLASSES, ASSET_SUBTYPES, SQFT_PER_ACRE, type AssetClass } from './taxonomy';

/**
 * Sourcing criteria per asset class (docs/asset-classes.md s3). A sourcing
 * market names the classes it looks for and, for each, its own filters.
 * Providers apply few filters themselves; the rest are applied by Halo to
 * the records a search returns, which still cost what the provider charges
 * for the page. SOURCING_COVERAGE says which is which, per provider.
 */

const n = z.number().finite().nonnegative();
const STR = z.string().trim().min(1).max(100);

export const LandCriteriaSchema = z
  .object({
    subtypes: z.array(z.enum(ASSET_SUBTYPES.land)).max(8).optional(),
    counties: z.array(STR).max(20).optional(),
    apns: z.array(STR).max(200).optional(),
    minAcres: n.optional(),
    maxAcres: n.optional(),
    /** Keep only parcels with no building on record. */
    vacantOnly: z.boolean().optional(),
    /** Land-use labels or county codes to keep (contains, any case). */
    landUse: z.array(STR).max(20).optional(),
    minAssessed: n.optional(),
    maxAssessed: n.optional(),
    /** Owned at least this many years (from the last recorded sale). */
    minOwnershipYears: n.optional(),
    absenteeOnly: z.boolean().optional(),
    taxDelinquentOnly: z.boolean().optional(),
    liensOnly: z.boolean().optional(),
    /** Keep only parcels with a development or subdivision indicator. */
    developmentIndicators: z.boolean().optional(),
  })
  .strict();
export type LandCriteria = z.infer<typeof LandCriteriaSchema>;

export const CommercialCriteriaSchema = z
  .object({
    subtypes: z.array(z.enum(ASSET_SUBTYPES.commercial)).max(9).optional(),
    counties: z.array(STR).max(20).optional(),
    minBuildingSqft: n.optional(),
    maxBuildingSqft: n.optional(),
    minLotAcres: n.optional(),
    maxLotAcres: n.optional(),
    minUnits: n.optional(),
    maxUnits: n.optional(),
    minYearBuilt: n.optional(),
    maxYearBuilt: n.optional(),
    minAssessed: n.optional(),
    maxAssessed: n.optional(),
    minOwnershipYears: n.optional(),
    /** Last sale on or after this date (YYYY-MM-DD). */
    soldSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    ownerKinds: z.array(z.enum(['company', 'trust', 'individual'])).max(3).optional(),
    /** Keep only records with a distress signal (tax delinquency, liens, foreclosure). */
    distressOnly: z.boolean().optional(),
  })
  .strict();
export type CommercialCriteria = z.infer<typeof CommercialCriteriaSchema>;

export const SourcingAssetClassesSchema = z.array(z.enum(ASSET_CLASSES)).min(1).max(3);

/** What a search returned, as the criteria see it. */
export interface ParcelCandidate {
  state: string | null;
  county: string | null;
  apn: string | null;
  acres: number | null;
  buildingSqft: number | null;
  units: number | null;
  yearBuilt: number | null;
  landUse: string | null;
  assessedValue: number | null;
  lastSaleDate: string | null;
  absentee: boolean | null;
  taxDelinquent: boolean | null;
  lienCount: number | null;
  foreclosure: boolean | null;
  ownerKind: string | null;
  classification: AssetClassification;
  /** Whether a building is on record: true, false, or null when the record cannot tell. */
  improved: boolean | null;
}

export interface CriteriaVerdict {
  keep: boolean;
  /** The first filter that rejected it, or what to confirm when it was kept unclassified. */
  reason: string | null;
}

const YEAR_MS = 365.25 * 86_400_000;
const ownedYears = (lastSale: string | null, asOf: Date) => (lastSale ? (asOf.getTime() - Date.parse(lastSale)) / YEAR_MS : null);

/**
 * Whether a record belongs in a market sourcing `assetClass`. A record the
 * rules could not classify is kept when its suggestion matches, tagged for
 * a person to confirm; a record classified as something else is dropped.
 * A filter on a fact the record lacks rejects it: a parcel whose acreage is
 * unknown does not meet "at least 5 acres".
 */
export function matchesCriteria(
  c: ParcelCandidate,
  assetClass: AssetClass,
  criteria: LandCriteria | CommercialCriteria | undefined,
  asOf: Date,
): CriteriaVerdict {
  const cls = c.classification;
  const effective = cls.assetClass ?? cls.suggestion?.assetClass ?? null;
  if (effective !== assetClass) {
    return { keep: false, reason: cls.assetClass ? `classified as ${cls.assetClass}` : 'could not be classified' };
  }
  const subtype = cls.subtype ?? cls.suggestion?.subtype ?? null;
  const reject = (why: string): CriteriaVerdict => ({ keep: false, reason: why });
  const crit = criteria ?? {};
  const counties = (crit as { counties?: string[] }).counties;
  if (counties?.length && !counties.map(normalizeCounty).includes(normalizeCounty(c.county))) {
    return reject('outside the chosen counties');
  }
  if ((crit as { subtypes?: string[] }).subtypes?.length && !(crit as { subtypes: string[] }).subtypes.includes(subtype ?? '')) {
    return reject(subtype ? `subtype ${subtype} not chosen` : 'subtype unknown');
  }
  const years = ownedYears(c.lastSaleDate, asOf);
  const between = (v: number | null, lo: number | undefined, hi: number | undefined, what: string): string | null => {
    if (lo == null && hi == null) return null;
    if (v == null) return `${what} unknown`;
    if (lo != null && v < lo) return `${what} below the minimum`;
    if (hi != null && v > hi) return `${what} above the maximum`;
    return null;
  };

  if (assetClass === 'land') {
    const l = crit as LandCriteria;
    if (l.apns?.length && !l.apns.map(normalizeApn).includes(normalizeApn(c.apn))) return reject('APN not in the list');
    const why =
      between(c.acres, l.minAcres, l.maxAcres, 'acreage') ??
      between(c.assessedValue, l.minAssessed, l.maxAssessed, 'assessed value') ??
      (l.minOwnershipYears != null ? between(years, l.minOwnershipYears, undefined, 'length of ownership') : null);
    if (why) return reject(why);
    if (l.vacantOnly && c.improved === true) return reject('a building is on record');
    if (l.landUse?.length && !l.landUse.some((u) => (c.landUse ?? '').toUpperCase().includes(u.toUpperCase()))) {
      return reject('land use not chosen');
    }
    if (l.absenteeOnly && c.absentee !== true) return reject('owner not known to be absentee');
    if (l.taxDelinquentOnly && c.taxDelinquent !== true) return reject('not known to be tax delinquent');
    if (l.liensOnly && !((c.lienCount ?? 0) > 0)) return reject('no lien on record');
    if (l.developmentIndicators && cls.developmentIndicators.length === 0) return reject('no development indicator');
  } else if (assetClass === 'commercial') {
    const k = crit as CommercialCriteria;
    const lotAcres = c.acres;
    const why =
      between(c.buildingSqft, k.minBuildingSqft, k.maxBuildingSqft, 'building area') ??
      between(lotAcres, k.minLotAcres, k.maxLotAcres, 'lot size') ??
      between(c.units, k.minUnits, k.maxUnits, 'unit count') ??
      between(c.yearBuilt, k.minYearBuilt, k.maxYearBuilt, 'year built') ??
      between(c.assessedValue, k.minAssessed, k.maxAssessed, 'assessed value') ??
      (k.minOwnershipYears != null ? between(years, k.minOwnershipYears, undefined, 'length of ownership') : null);
    if (why) return reject(why);
    if (k.soldSince && !(c.lastSaleDate && c.lastSaleDate >= k.soldSince)) return reject('no sale since the chosen date');
    if (k.ownerKinds?.length && !k.ownerKinds.includes((c.ownerKind ?? '') as 'company')) return reject('owner type not chosen');
    if (k.distressOnly && !(c.taxDelinquent || (c.lienCount ?? 0) > 0 || c.foreclosure)) return reject('no distress signal');
  }
  return { keep: true, reason: cls.assetClass ? null : (cls.unresolved ?? 'confirm the asset class') };
}

/** acres from either field, for providers that report one or the other. */
export function acresFrom(acres: number | null | undefined, lotSqft: number | null | undefined): number | null {
  if (acres != null && acres > 0) return acres;
  if (lotSqft != null && lotSqft > 0) return Math.round((lotSqft / SQFT_PER_ACRE) * 1000) / 1000;
  return null;
}

// ------------------------------------------------------------- coverage

export type FilterSupport = 'provider' | 'halo' | 'none';

export interface CoverageRow {
  filter: string;
  label: string;
  assetClasses: readonly AssetClass[];
  realie: FilterSupport;
  rentcast: FilterSupport;
  regrid: FilterSupport;
  note?: string;
}

/**
 * Which filters each provider can apply, read from the integrations in
 * this repository. `provider`: the vendor filters before it charges;
 * `halo`: the vendor returns the field and Halo filters the page it paid
 * for; `none`: the vendor does not return it. Regrid entries follow
 * Regrid's published parcel schema and have not been run against a live
 * response here (no Regrid token is configured).
 */
export const SOURCING_COVERAGE: readonly CoverageRow[] = [
  { filter: 'area', label: 'State, county, city, ZIP', assetClasses: ['residential', 'land', 'commercial'], realie: 'provider', rentcast: 'provider', regrid: 'provider', note: 'RentCast has no county filter.' },
  { filter: 'asset_class', label: 'Residential vs non-residential', assetClasses: ['residential', 'land', 'commercial'], realie: 'provider', rentcast: 'provider', regrid: 'halo', note: 'Realie has a residential true/false flag only; land and commercial are told apart by Halo. RentCast has a "Land" property type for listed land.' },
  { filter: 'apn', label: 'Parcel number (APN)', assetClasses: ['land'], realie: 'halo', rentcast: 'none', regrid: 'provider' },
  { filter: 'acres', label: 'Acreage and lot size', assetClasses: ['land', 'commercial'], realie: 'halo', rentcast: 'halo', regrid: 'halo', note: 'RentCast lotSize is documented, not yet seen in a live response.' },
  { filter: 'vacant', label: 'Vacant vs improved', assetClasses: ['land'], realie: 'halo', rentcast: 'none', regrid: 'halo', note: 'Realie: no building area or year on record is read as "possibly vacant", not as vacant.' },
  { filter: 'land_use', label: 'Land-use classification', assetClasses: ['land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'halo', note: 'Realie returns the county use code (a number that differs by county); map codes once on a property page.' },
  { filter: 'zoning', label: 'Zoning', assetClasses: ['land', 'commercial'], realie: 'none', rentcast: 'none', regrid: 'halo' },
  { filter: 'assessed', label: 'Assessed value', assetClasses: ['land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'halo' },
  { filter: 'last_sale', label: 'Last sale and length of ownership', assetClasses: ['land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'halo', note: 'Realie can also filter "transferred in the last N days" itself.' },
  { filter: 'absentee', label: 'Absentee ownership', assetClasses: ['residential', 'land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'halo' },
  { filter: 'tax_delinquent', label: 'Tax delinquency', assetClasses: ['residential', 'land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'none' },
  { filter: 'liens', label: 'Liens and foreclosure', assetClasses: ['residential', 'land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'none' },
  { filter: 'development', label: 'Development or subdivision indicators', assetClasses: ['land'], realie: 'halo', rentcast: 'none', regrid: 'halo', note: 'Derived by Halo from acreage and zoning; indicators, not findings.' },
  { filter: 'building', label: 'Building size, units, age', assetClasses: ['commercial'], realie: 'halo', rentcast: 'halo', regrid: 'halo' },
  { filter: 'owner_entity', label: 'Ownership entity (company, trust, person)', assetClasses: ['land', 'commercial'], realie: 'halo', rentcast: 'none', regrid: 'halo' },
  { filter: 'occupancy', label: 'Vacancy or occupancy', assetClasses: ['commercial'], realie: 'none', rentcast: 'none', regrid: 'none', note: 'No provider here reports it; it comes from the seller\'s rent roll.' },
];
