import {
  OPERATOR_ONLY_SUBTYPES,
  SQFT_PER_ACRE,
  type AssetClass,
  type AssetSubtype,
  type CommercialSubtype,
  type LandSubtype,
  type ResidentialSubtype,
} from './taxonomy';

/**
 * Property classification from what a parcel is, not what one provider
 * calls it (docs/asset-classes.md s2). Provider labels are read as
 * evidence alongside the physical facts: whether a building stands on the
 * parcel, how many units it has, its size, its zoning. Raw land and
 * commercial land differ by those facts: an unbuilt parcel zoned for
 * commerce is land (subtype commercial_land), and a building used for
 * commerce is commercial.
 *
 * Deterministic and conservative. When the evidence conflicts or is thin
 * the result is unclassified, with a suggestion a person can confirm; a
 * record is never forced into residential because that is the default.
 */

export interface ClassificationInput {
  /** Provider labels as given: property type, land use, use description. */
  labels?: Array<string | null | undefined>;
  zoning?: string | null;
  units?: number | null;
  /** Any building area on the parcel (living or gross), in square feet. */
  buildingSqft?: number | null;
  yearBuilt?: number | null;
  lotSqft?: number | null;
  acres?: number | null;
  improvementValue?: number | null;
  /** A provider's own residential flag (Realie's `residential`). */
  residentialFlag?: boolean | null;
  /** A provider's statement that a structure is present (Regrid `struct`). */
  hasStructure?: boolean | null;
}

export type ClassificationConfidence = 'high' | 'medium' | 'low';

export interface AssetClassification {
  assetClass: AssetClass | null;
  subtype: AssetSubtype | null;
  confidence: ClassificationConfidence | null;
  /** Each piece of evidence the decision rests on, in words. */
  reasons: string[];
  /** The labels read, exactly as the provider gave them. */
  providerLabels: string[];
  /** Set when the record stays unclassified: what a person should check. */
  unresolved: string | null;
  /** A weak or conflicting reading, offered for a person to confirm. */
  suggestion: { assetClass: AssetClass; subtype: AssetSubtype | null } | null;
  /** Land only: signs a parcel could be developed or split. Indicators, not findings. */
  developmentIndicators: string[];
}

type Hint =
  | { cls: 'land'; subtype: LandSubtype | null }
  | { cls: 'commercial'; subtype: CommercialSubtype | null }
  | { cls: 'residential'; subtype: ResidentialSubtype | null };

/**
 * Label patterns, most specific first. They match the standardized labels
 * ATTOM, Regrid and county rolls use ("VACANT LAND (NEC)", "SFR",
 * "WAREHOUSE", "APARTMENT") and the plain words a CSV carries. A numeric
 * county use code matches nothing, on purpose: codes differ by county.
 */
const LABEL_RULES: Array<{ re: RegExp; hint: Hint; vacant?: boolean }> = [
  { re: /\b(AGRICULT|FARM|RANCH|PASTURE|CROP|ORCHARD|VINEYARD|TIMBER|GRAZING|DAIRY)/, hint: { cls: 'land', subtype: 'agricultural' }, vacant: true },
  { re: /\b(RECREATION|HUNTING|CAMPGROUND)/, hint: { cls: 'land', subtype: 'recreational' }, vacant: true },
  { re: /\b(VACANT|UNIMPROVED|UNDEVELOPED|RAW LAND)\b.*\b(COMMERCIAL|INDUSTRIAL|RETAIL|OFFICE)/, hint: { cls: 'land', subtype: 'commercial_land' }, vacant: true },
  { re: /\b(COMMERCIAL|INDUSTRIAL)\b.*\b(VACANT|LAND|LOT|ACREAGE)\b/, hint: { cls: 'land', subtype: 'commercial_land' }, vacant: true },
  { re: /\b(VACANT|UNIMPROVED)\b.*\bRESIDENTIAL\b|\bRESIDENTIAL\b.*\b(VACANT|LOT)\b/, hint: { cls: 'land', subtype: 'residential_lot' }, vacant: true },
  { re: /\bRESIDENTIAL ACREAGE\b|\bACREAGE\b/, hint: { cls: 'land', subtype: 'rural_acreage' }, vacant: true },
  { re: /\b(VACANT|UNIMPROVED|UNDEVELOPED|RAW LAND|LAND ONLY)\b|^LAND\b|\bLOTS?\b$/, hint: { cls: 'land', subtype: null }, vacant: true },
  { re: /\b(MIXED.?USE|STORE.?(AND|&|W\/).?(APT|RESIDENCE|OFFICE))/, hint: { cls: 'commercial', subtype: 'mixed_use' } },
  { re: /\b(SELF.?STORAGE|MINI.?(WAREHOUSE|STORAGE))/, hint: { cls: 'commercial', subtype: 'self_storage' } },
  { re: /\bFLEX\b/, hint: { cls: 'commercial', subtype: 'flex' } },
  { re: /\b(HOTEL|MOTEL|HOSPITALITY|RESORT|LODG)/, hint: { cls: 'commercial', subtype: 'hospitality' } },
  { re: /\b(WAREHOUSE|INDUSTRIAL|MANUFACTUR|DISTRIBUTION|FACTORY|LIGHT IND)/, hint: { cls: 'commercial', subtype: 'industrial' } },
  { re: /\bOFFICE\b|MEDICAL OFFICE|PROFESSIONAL BLDG/, hint: { cls: 'commercial', subtype: 'office' } },
  { re: /\b(RETAIL|SHOPPING|STORE|RESTAURANT|STRIP CENTER|SERVICE STATION|AUTO REPAIR|BANK)/, hint: { cls: 'commercial', subtype: 'retail' } },
  { re: /\b(APARTMENT|MULTI.?FAMILY \(?5|5\+ UNITS|MULTIFAMILY 5)/, hint: { cls: 'commercial', subtype: 'multifamily' } },
  { re: /\b(DUPLEX|TRIPLEX|QUADRUPLEX|QUADPLEX|FOURPLEX|FOUR.?PLEX|2-4 UNITS|MULTI.?FAMILY \(?2)/, hint: { cls: 'residential', subtype: 'small_multifamily' } },
  { re: /\b(MOBILE|MANUFACTURED)\b/, hint: { cls: 'residential', subtype: 'manufactured' } },
  { re: /\b(CONDO|TOWNHOUSE|TOWNHOME|ROWHOUSE|CO-?OP)/, hint: { cls: 'residential', subtype: 'condo_townhome' } },
  { re: /\b(SFR|SINGLE.?FAMILY|SINGLE.?FAM|RESIDENCE|DWELLING)\b/, hint: { cls: 'residential', subtype: 'single_family' } },
  { re: /\bMULTI.?FAMILY\b/, hint: { cls: 'residential', subtype: null } },
  { re: /\bCOMMERCIAL\b/, hint: { cls: 'commercial', subtype: 'other_commercial' } },
  { re: /\bRESIDENTIAL\b/, hint: { cls: 'residential', subtype: null } },
];

const ZONING_COMMERCIAL = /^(C|B|I|M|LI|HI|GC|CBD|NC|OC|IND|COM)[-\d\s]|^(COMMERCIAL|INDUSTRIAL|BUSINESS|OFFICE)/i;
const ZONING_AG = /^(A|AG|AR|AF)[-\d\s]|^AGRIC/i;
const ZONING_RESIDENTIAL = /^(R|RS|RE|SF|RM|MF|RR)[-\d\s]|^RESIDENTIAL/i;

const positive = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

function acresOf(input: ClassificationInput): number | null {
  if (positive(input.acres)) return input.acres;
  if (positive(input.lotSqft)) return input.lotSqft / SQFT_PER_ACRE;
  return null;
}

/**
 * Whether a building stands on the parcel: true, false, or null when the
 * record cannot tell. A missing building area is not evidence of vacancy;
 * only a provider saying so, or an explicit zero improvement value, is.
 */
export function improvementStatus(input: ClassificationInput): boolean | null {
  if (input.hasStructure === true) return true;
  if (positive(input.buildingSqft) || positive(input.yearBuilt) || positive(input.units)) return true;
  if (input.hasStructure === false) return false;
  if (input.improvementValue === 0) return false;
  if (positive(input.improvementValue)) return true;
  return null;
}

function labelHints(labels: string[]): Array<{ label: string; hint: Hint; vacant: boolean }> {
  const out: Array<{ label: string; hint: Hint; vacant: boolean }> = [];
  for (const label of labels) {
    const text = label.toUpperCase();
    const rule = LABEL_RULES.find((r) => r.re.test(text));
    if (rule) out.push({ label, hint: rule.hint, vacant: !!rule.vacant });
  }
  return out;
}

function landSubtype(
  hinted: LandSubtype | null,
  acres: number | null,
  zoning: string | null,
  reasons: string[],
): LandSubtype | null {
  if (hinted && !OPERATOR_ONLY_SUBTYPES.includes(hinted)) return hinted;
  if (zoning && ZONING_COMMERCIAL.test(zoning)) {
    reasons.push(`zoned ${zoning}, a commercial or industrial district`);
    return 'commercial_land';
  }
  if (zoning && ZONING_AG.test(zoning)) {
    reasons.push(`zoned ${zoning}, an agricultural district`);
    return 'agricultural';
  }
  if (acres != null && acres >= 5) {
    reasons.push(`${round1(acres)} acres`);
    return 'rural_acreage';
  }
  if (acres != null && acres < 1 && (!zoning || ZONING_RESIDENTIAL.test(zoning))) {
    reasons.push(`${round1(acres)} acres${zoning ? `, zoned ${zoning}` : ''}`);
    return 'residential_lot';
  }
  return null;
}

function developmentIndicators(acres: number | null, zoning: string | null, subtype: LandSubtype | null): string[] {
  const out: string[] = [];
  if (acres != null && acres >= 10) out.push(`${round1(acres)} acres: large enough that a split could be studied`);
  if (zoning && ZONING_RESIDENTIAL.test(zoning) && acres != null && acres >= 2) {
    out.push(`residential zoning (${zoning}) on ${round1(acres)} acres`);
  }
  if (subtype === 'commercial_land') out.push('commercial zoning or land use on an unbuilt parcel');
  return out;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function classifyProperty(input: ClassificationInput): AssetClassification {
  const providerLabels = (input.labels ?? [])
    .map((l) => (l == null ? '' : String(l).trim()))
    .filter((l) => l.length > 0);
  const zoning = input.zoning?.trim() || null;
  const acres = acresOf(input);
  const improved = improvementStatus(input);
  const units = positive(input.units) ? Math.round(input.units) : null;
  const reasons: string[] = [];
  const hints = labelHints(providerLabels);
  const base = { providerLabels, developmentIndicators: [] as string[] };

  const unclassified = (why: string, suggestion: AssetClassification['suggestion'] = null): AssetClassification => ({
    ...base,
    assetClass: null,
    subtype: null,
    confidence: null,
    reasons,
    unresolved: why,
    suggestion,
  });
  const classified = (
    assetClass: AssetClass,
    subtype: AssetSubtype | null,
    confidence: ClassificationConfidence,
  ): AssetClassification => {
    if (confidence === 'low') {
      return unclassified('The evidence is too thin to classify this record; confirm what it is.', { assetClass, subtype });
    }
    return {
      ...base,
      assetClass,
      subtype,
      confidence,
      reasons,
      unresolved: null,
      suggestion: null,
      developmentIndicators: assetClass === 'land' ? developmentIndicators(acres, zoning, subtype as LandSubtype | null) : [],
    };
  };

  // Unit count settles residential versus commercial for housing: five or
  // more units is a commercial multifamily asset whatever the label says.
  if (units != null && units >= 5) {
    reasons.push(`${units} units`);
    const commercialHint = hints.find((h) => h.hint.cls === 'commercial');
    if (commercialHint && commercialHint.hint.subtype && commercialHint.hint.subtype !== 'multifamily') {
      reasons.push(`labelled "${commercialHint.label}"`);
      return classified('commercial', commercialHint.hint.subtype, 'medium');
    }
    return classified('commercial', 'multifamily', hints.length ? 'high' : 'medium');
  }

  const classes = new Set(hints.map((h) => h.hint.cls));
  if (classes.size > 1) {
    // Labels disagree ("COMMERCIAL" and "SFR"): the building facts may still settle it.
    const vacantHint = hints.find((h) => h.vacant);
    if (improved === false && vacantHint) {
      reasons.push(`labelled "${vacantHint.label}" and no building on record`);
      const st = landSubtype(vacantHint.hint.subtype as LandSubtype | null, acres, zoning, reasons);
      return classified('land', st, 'medium');
    }
    reasons.push(`labels disagree: ${hints.map((h) => `"${h.label}"`).join(', ')}`);
    return unclassified('The provider labels disagree about what this is; confirm it.');
  }

  const hint = hints[0];
  if (hint) {
    reasons.push(`labelled "${hint.label}"`);
    if (hint.hint.cls === 'land') {
      if (improved === true) {
        // A land label on a parcel with a building: a house on acreage, a
        // barn on a farm, or a stale label. A person decides.
        reasons.push('but a building is on record');
        return unclassified('Labelled as land, but a building is on record; confirm whether it is vacant.', {
          assetClass: 'land',
          subtype: hint.hint.subtype,
        });
      }
      if (improved === false) reasons.push('no building on record');
      const st = landSubtype(hint.hint.subtype, acres, zoning, reasons);
      return classified('land', st, improved === false ? 'high' : 'medium');
    }
    if (hint.hint.cls === 'commercial') {
      if (improved === false) {
        // "COMMERCIAL" on an unbuilt parcel is commercial land.
        reasons.push('no building on record');
        return classified('land', 'commercial_land', 'medium');
      }
      if (improved === true) reasons.push('a building is on record');
      // A bare "COMMERCIAL" with nothing on the building could be a lot.
      const generic = hint.hint.subtype === 'other_commercial';
      return classified('commercial', hint.hint.subtype, improved === true ? 'high' : generic ? 'low' : 'medium');
    }
    // Residential label.
    if (improved === false) {
      reasons.push('no building on record');
      return classified('land', landSubtype('residential_lot', acres, zoning, reasons), 'medium');
    }
    let subtype = hint.hint.subtype;
    if (units != null && units >= 2 && units <= 4) {
      reasons.push(`${units} units`);
      subtype = 'small_multifamily';
    }
    if (subtype == null && units === 1) subtype = 'single_family';
    if (improved === true) reasons.push('a building is on record');
    return classified('residential', subtype, improved === true ? 'high' : subtype != null ? 'medium' : 'low');
  }

  // No usable label (none given, or a numeric county use code).
  if (providerLabels.length) reasons.push(`label${providerLabels.length > 1 ? 's' : ''} ${providerLabels.map((l) => `"${l}"`).join(', ')} not recognized`);
  if (improved === false) {
    reasons.push('no building on record');
    const st = landSubtype(null, acres, zoning, reasons);
    if (input.residentialFlag === false) reasons.push('the provider marks it non-residential');
    return classified('land', st, st ? 'medium' : 'low');
  }
  if (improved === true) {
    if (units != null && units >= 2 && units <= 4) {
      reasons.push(`${units} units`);
      return classified('residential', 'small_multifamily', 'medium');
    }
    if (input.residentialFlag === true) {
      reasons.push('the provider marks it residential', 'a building is on record');
      return classified('residential', units === 1 ? 'single_family' : null, 'medium');
    }
    if (input.residentialFlag === false) {
      reasons.push('the provider marks it non-residential', 'a building is on record');
      if (zoning && ZONING_COMMERCIAL.test(zoning)) {
        reasons.push(`zoned ${zoning}`);
        return classified('commercial', null, 'medium');
      }
      return classified('commercial', null, 'low');
    }
    reasons.push('a building is on record');
    return unclassified('A building is on record but nothing says what it is used for.');
  }
  if (input.residentialFlag === true) {
    reasons.push('the provider marks it residential');
    return classified('residential', null, 'low');
  }
  if (input.residentialFlag === false) {
    reasons.push('the provider marks it non-residential');
    return unclassified('Non-residential, but the record does not say whether it is land or a commercial building.', {
      assetClass: 'land',
      subtype: null,
    });
  }
  return unclassified('Nothing on the record says what kind of property this is.');
}
