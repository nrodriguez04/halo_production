import type { AssetClass } from './taxonomy';

/**
 * Property intelligence (docs/asset-classes.md s4): the facts land and
 * commercial deals turn on, each with how it was established. The status
 * is the point. A fact is only as good as its source:
 *
 * - verified: an authoritative record (county, GIS, a federal map) or a
 *   document a person checked;
 * - reported: a data provider's compilation, or what the seller said or
 *   sent, not yet checked;
 * - estimated: derived or modelled;
 * - unknown: nothing on file;
 * - needs_diligence: only a professional can settle it (a surveyor, a
 *   title company, an engineer, an environmental consultant).
 *
 * A missing fact is never a favorable one. A utility line on the next road
 * is not utility service, and a parcel that touches a road does not have
 * legal access because of it. Underwriting reads `unknown` as a risk.
 */

export const FACT_STATUSES = ['verified', 'reported', 'estimated', 'unknown', 'needs_diligence'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  verified: 'Verified',
  reported: 'Reported, not verified',
  estimated: 'Estimate',
  unknown: 'Unknown',
  needs_diligence: 'Needs professional due diligence',
};

export type FactValueType = 'number' | 'boolean' | 'text' | 'document';

export interface FactDefinition {
  key: string;
  label: string;
  assetClasses: readonly AssetClass[];
  type: FactValueType;
  unit?: string;
  /**
   * Who can settle it: a public record, the seller's documents, or a
   * professional. A `professional` fact stays needs_diligence until a
   * report is on file, whatever a provider says.
   */
  settledBy: 'record' | 'seller' | 'professional';
  /** Underwriting treats an unknown value as a material risk. */
  critical: boolean;
  /** What the owner should know about it, in plain words. */
  help: string;
}

const LAND: readonly AssetClass[] = ['land'];
const COMMERCIAL: readonly AssetClass[] = ['commercial'];
const BOTH: readonly AssetClass[] = ['land', 'commercial'];

export const PROPERTY_FACTS: readonly FactDefinition[] = [
  // ------------------------------------------------------------------ land
  { key: 'parcel_boundary', label: 'Parcel boundary', assetClasses: LAND, type: 'text', settledBy: 'record', critical: false, help: 'The parcel shape from the county or a GIS provider. A survey is the only exact boundary.' },
  { key: 'gross_acres', label: 'Gross acreage', assetClasses: LAND, type: 'number', unit: 'acres', settledBy: 'record', critical: true, help: 'The parcel size on the county record. Land is priced per acre, so this drives the valuation.' },
  { key: 'usable_acres', label: 'Usable acreage', assetClasses: LAND, type: 'number', unit: 'acres', settledBy: 'professional', critical: false, help: 'Acreage left after flood zone, wetlands, steep slopes and easements. Usually less than gross acreage.' },
  { key: 'legal_access', label: 'Legal access', assetClasses: LAND, type: 'boolean', settledBy: 'professional', critical: true, help: 'A recorded right to reach the parcel: frontage on a public road or a recorded easement. Touching a road on a map does not prove it; title work does.' },
  { key: 'physical_access', label: 'Physical access', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Whether a vehicle can actually reach it (a driveway, a gate, a creek crossing).' },
  { key: 'road_frontage_ft', label: 'Road frontage', assetClasses: LAND, type: 'number', unit: 'feet', settledBy: 'professional', critical: false, help: 'Feet of boundary on a public road. Many counties require a minimum to build or to split.' },
  { key: 'easements', label: 'Easements and access concerns', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Pipelines, power lines, shared drives or other rights over the land, from the title commitment.' },
  { key: 'zoning', label: 'Zoning', assetClasses: BOTH, type: 'text', settledBy: 'record', critical: true, help: 'The district the city or county places the parcel in. It decides what can be built and what buyers will pay. Unincorporated county land may have none.' },
  { key: 'permitted_uses', label: 'Permitted uses', assetClasses: BOTH, type: 'text', settledBy: 'record', critical: false, help: 'What the zoning allows on this parcel, from the municipal code or the planning office.' },
  { key: 'setbacks', label: 'Setbacks and development restrictions', assetClasses: LAND, type: 'text', settledBy: 'record', critical: false, help: 'How far buildings must sit from the lines, height and density limits.' },
  { key: 'utility_water', label: 'Water service', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: true, help: 'Whether a water provider will serve the parcel, or a well is needed. A nearby main is not service; a will-serve letter is.' },
  { key: 'utility_sewer', label: 'Sewer or septic', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: true, help: 'Public sewer, or whether the soil passes a septic (perc) test.' },
  { key: 'utility_electric', label: 'Electric service', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Whether power reaches the parcel and what extending it would cost.' },
  { key: 'flood_zone', label: 'Flood zone', assetClasses: BOTH, type: 'text', settledBy: 'record', critical: true, help: 'The FEMA flood zone at the parcel. Zones starting with A or V are high-risk; building there needs elevation and flood insurance.' },
  { key: 'wetlands', label: 'Wetlands', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Mapped wetlands on the parcel (US Fish and Wildlife Service). Building in wetlands may need a federal permit; only a delineation is definitive.' },
  { key: 'topography', label: 'Topography and slope', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Steep or uneven ground raises the cost of building or makes part of the parcel unusable.' },
  { key: 'soil_septic', label: 'Soil and septic suitability', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Soil survey indicators and perc test results. A failed perc test can make a rural lot unbuildable.' },
  { key: 'survey_on_file', label: 'Survey on file', assetClasses: BOTH, type: 'document', settledBy: 'professional', critical: false, help: 'A boundary survey (or an ALTA survey for commercial) showing lines, improvements and encroachments.' },
  { key: 'deed_restrictions', label: 'Deed restrictions', assetClasses: BOTH, type: 'text', settledBy: 'professional', critical: false, help: 'Covenants, HOA rules or plat restrictions that limit use, from the title commitment.' },
  { key: 'mineral_rights', label: 'Mineral rights', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Whether the minerals were severed from the surface. Common in Texas; it affects what a buyer receives.' },
  { key: 'water_rights', label: 'Water rights', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Rights to surface or groundwater, where the state treats them separately from the land.' },
  { key: 'subdivision_potential', label: 'Development and subdivision potential', assetClasses: LAND, type: 'text', settledBy: 'professional', critical: false, help: 'Whether the parcel could be split or developed under local rules. Indicators only until a planner or engineer reviews it.' },
  // ------------------------------------------------------------ commercial
  { key: 'building_sqft', label: 'Building area', assetClasses: COMMERCIAL, type: 'number', unit: 'sq ft', settledBy: 'record', critical: true, help: 'Gross building area from the county or the seller.' },
  { key: 'leasable_sqft', label: 'Leasable area', assetClasses: COMMERCIAL, type: 'number', unit: 'sq ft', settledBy: 'seller', critical: false, help: 'The area tenants pay for, from the rent roll or leases.' },
  { key: 'units', label: 'Units', assetClasses: COMMERCIAL, type: 'number', settledBy: 'record', critical: false, help: 'Apartment units or tenant suites.' },
  { key: 'occupancy_rate', label: 'Occupancy', assetClasses: COMMERCIAL, type: 'number', unit: '%', settledBy: 'seller', critical: true, help: 'Share of the space leased and paying, from a current rent roll. Never assumed.' },
  { key: 'rent_roll', label: 'Rent roll', assetClasses: COMMERCIAL, type: 'document', settledBy: 'seller', critical: true, help: 'The list of tenants, rents, deposits and lease dates. Request it from the seller.' },
  { key: 'lease_terms', label: 'Lease terms and expirations', assetClasses: COMMERCIAL, type: 'text', settledBy: 'seller', critical: false, help: 'When leases end and on what terms. Near-term expirations are a risk to income.' },
  { key: 'gross_operating_income', label: 'Gross operating income', assetClasses: COMMERCIAL, type: 'number', unit: '$/yr', settledBy: 'seller', critical: true, help: 'A year of collected income, from the trailing-12-month operating statement (T12).' },
  { key: 'operating_expenses', label: 'Operating expenses', assetClasses: COMMERCIAL, type: 'number', unit: '$/yr', settledBy: 'seller', critical: true, help: 'A year of expenses from the T12: taxes, insurance, utilities, repairs, management. Halo never assumes an expense ratio.' },
  { key: 'noi', label: 'Net operating income', assetClasses: COMMERCIAL, type: 'number', unit: '$/yr', settledBy: 'seller', critical: true, help: 'Income less operating expenses, before debt. The income valuation divides it by a cap rate, so it must come from real statements.' },
  { key: 'capex_needs', label: 'Capital expenditure needs', assetClasses: COMMERCIAL, type: 'number', unit: '$', settledBy: 'professional', critical: false, help: 'Roofs, parking, HVAC and other major work due, from a property condition report.' },
  { key: 'property_taxes', label: 'Property taxes', assetClasses: COMMERCIAL, type: 'number', unit: '$/yr', settledBy: 'record', critical: false, help: 'The annual tax bill. A sale can trigger a reassessment.' },
  { key: 'market_rent', label: 'Market rent estimate', assetClasses: COMMERCIAL, type: 'number', unit: '$/sq ft/yr', settledBy: 'record', critical: false, help: 'What comparable space leases for. An estimate unless it comes from signed comparable leases.' },
  { key: 'cap_rate', label: 'Market cap rate', assetClasses: COMMERCIAL, type: 'number', unit: '%', settledBy: 'record', critical: true, help: 'The yield buyers accept for this kind of property here. It must come from a named source (comparable sales, a broker survey); Halo has no default.' },
  { key: 'environmental', label: 'Environmental risks', assetClasses: COMMERCIAL, type: 'text', settledBy: 'professional', critical: false, help: 'Contamination risk, from a Phase I environmental site assessment. Gas stations, dry cleaners and industrial uses carry the most.' },
  { key: 'tenant_diligence', label: 'Tenant and lease diligence', assetClasses: COMMERCIAL, type: 'text', settledBy: 'professional', critical: false, help: 'Estoppel certificates, tenant credit and defaults: what the leases really say, confirmed by the tenants.' },
];

export const FACT_BY_KEY: Record<string, FactDefinition> = Object.fromEntries(PROPERTY_FACTS.map((f) => [f.key, f]));

export function factsFor(c: AssetClass | null | undefined): FactDefinition[] {
  return c ? PROPERTY_FACTS.filter((f) => f.assetClasses.includes(c)) : [];
}

export interface FactRecord {
  key: string;
  /** Number, boolean, text, or null with a document holding it. */
  value: number | boolean | string | null;
  status: FactStatus;
  /** Where it came from: a provider key, "seller", "operator", a document. */
  source: string | null;
  sourceUrl?: string | null;
  documentId?: string | null;
  observedAt?: Date | string | null;
  note?: string | null;
}

/** The fact as underwriting sees it: a value only when one is on file and it is not merely unknown. */
export function factValue(facts: readonly FactRecord[], key: string): FactRecord | null {
  const f = facts.find((x) => x.key === key);
  if (!f || f.status === 'unknown') return null;
  if (f.value == null && !f.documentId) return null;
  return f;
}

export function numericFact(facts: readonly FactRecord[], key: string): { value: number; status: FactStatus } | null {
  const f = factValue(facts, key);
  return f && typeof f.value === 'number' && Number.isFinite(f.value) ? { value: f.value, status: f.status } : null;
}

export interface FactChecklistItem {
  definition: FactDefinition;
  record: FactRecord | null;
  /** The status to show: what is on file, else unknown, else needs_diligence for a professional fact. */
  status: FactStatus;
}

/**
 * Every fact the asset class needs, with what is on file. A professional
 * fact with no report stays needs_diligence even when a provider has a
 * value: a provider's flood zone is a lead, a survey is the boundary.
 */
export function factChecklist(c: AssetClass | null | undefined, facts: readonly FactRecord[]): FactChecklistItem[] {
  return factsFor(c).map((definition) => {
    const record = facts.find((f) => f.key === definition.key) ?? null;
    let status: FactStatus = record?.status ?? 'unknown';
    if (definition.settledBy === 'professional' && status !== 'verified' && !record?.documentId) {
      status = record && record.status !== 'unknown' ? record.status : 'needs_diligence';
    }
    return { definition, record, status };
  });
}

/** Critical facts with nothing on file: the questions a deal cannot skip. */
export function criticalUnknowns(c: AssetClass | null | undefined, facts: readonly FactRecord[]): FactDefinition[] {
  return factsFor(c).filter((d) => d.critical && !factValue(facts, d.key));
}

/** The weaker of two statuses, for a value derived from both (NOI from income and expenses). */
export function weakerStatus(a: FactStatus, b: FactStatus): FactStatus {
  const order: FactStatus[] = ['verified', 'reported', 'estimated', 'needs_diligence', 'unknown'];
  return order[Math.max(order.indexOf(a), order.indexOf(b))];
}

/** FEMA flood zones starting with A or V are the special flood hazard area (high risk). */
export function isHighRiskFloodZone(zone: string | null | undefined): boolean {
  return !!zone && /^(A|V)/i.test(zone.trim());
}
