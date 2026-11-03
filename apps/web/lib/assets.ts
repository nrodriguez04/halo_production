/**
 * Asset classes for the web app (docs/asset-classes.md): residential, land
 * and commercial, their subtypes, property facts, diligence and the
 * underwriting result. They mirror packages/shared/src/assets, which the
 * web bundle does not import (the shared index pulls in server-only
 * modules); lib/__tests__/assets.test.ts fails when the two drift. The api
 * is the source of truth.
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

export type AssetSubtype = (typeof ASSET_SUBTYPES)[AssetClass][number];

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
 * Subtypes only a person sets: each is a judgement about what one parcel
 * could become. The rules never assign them, so a sourcing filter or a
 * county-code mapping cannot use them.
 */
export const OPERATOR_ONLY_SUBTYPES: readonly AssetSubtype[] = ['infill_lot', 'development_parcel', 'subdividable'];

export function isAssetClass(v: unknown): v is AssetClass {
  return typeof v === 'string' && (ASSET_CLASSES as readonly string[]).includes(v);
}

export function isSubtypeOf(c: AssetClass, s: string | null | undefined): s is AssetSubtype {
  return !!s && (ASSET_SUBTYPES[c] as readonly string[]).includes(s);
}

export function subtypeLabel(s: string | null | undefined): string | null {
  return s && s in ASSET_SUBTYPE_LABEL ? ASSET_SUBTYPE_LABEL[s as AssetSubtype] : null;
}

/** "Land: Rural acreage", "Commercial", or "Unclassified". */
export function assetLabel(c: string | null | undefined, s?: string | null): string {
  if (!isAssetClass(c)) return 'Unclassified';
  return isSubtypeOf(c, s) ? `${ASSET_CLASS_LABEL[c]}: ${ASSET_SUBTYPE_LABEL[s]}` : ASSET_CLASS_LABEL[c];
}

/** The list filter on Leads, Properties and Deals: the api's `assetClass` query param. */
export const ASSET_FILTERS = [
  { value: '', label: 'All asset classes' },
  { value: 'residential', label: 'Residential' },
  { value: 'land', label: 'Land' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'unclassified', label: 'Unclassified' },
] as const;
export type AssetFilter = (typeof ASSET_FILTERS)[number]['value'];

// ------------------------------------------------------------- parcels

export interface PropertyLabelInput {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  apn?: string | null;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

function countyName(c: string): string {
  const t = c.trim();
  return /\b(county|parish|borough)$/i.test(t) ? t : `${t} County`;
}

/**
 * How to name a property: its street address when it has one, else
 * "Parcel <APN>, <County> County, <ST>", else its coordinates. Mirrors
 * propertyLabel() in packages/shared/src/assets/parcel.ts.
 */
export function propertyLabel(p: PropertyLabelInput): string {
  if (p.address?.trim()) {
    return [p.address.trim(), p.city?.trim(), [p.state, p.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  }
  const where = [p.county?.trim() ? countyName(p.county) : null, p.state].filter(Boolean).join(', ');
  if (p.apn?.trim()) return `Parcel ${p.apn.trim()}${where ? `, ${where}` : ''}`;
  if (p.latitude != null && p.longitude != null) {
    return `Parcel at ${p.latitude.toFixed(5)}, ${p.longitude.toFixed(5)}${where ? `, ${where}` : ''}`;
  }
  return where ? `Unaddressed parcel, ${where}` : 'Unaddressed parcel';
}

/** "12.4 acres", "0.35 acres": the precision a county record supports. */
export function acresText(acres: number | null | undefined): string | null {
  if (acres == null || !Number.isFinite(acres) || acres <= 0) return null;
  const v = acres >= 10 ? Math.round(acres) : acres >= 1 ? Math.round(acres * 10) / 10 : Math.round(acres * 100) / 100;
  return `${v.toLocaleString('en-US')} acre${v === 1 ? '' : 's'}`;
}

// --------------------------------------------------------------- facts

export const FACT_STATUSES = ['verified', 'reported', 'estimated', 'unknown', 'needs_diligence'] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

export const FACT_STATUS_LABEL: Record<FactStatus, string> = {
  verified: 'Verified',
  reported: 'Reported, not verified',
  estimated: 'Estimate',
  unknown: 'Unknown',
  needs_diligence: 'Needs professional due diligence',
};

export const FACT_STATUS_VARIANT: Record<FactStatus, 'success' | 'info' | 'secondary' | 'outline' | 'warning'> = {
  verified: 'success',
  reported: 'info',
  estimated: 'secondary',
  unknown: 'outline',
  needs_diligence: 'warning',
};

export type FactValueType = 'number' | 'boolean' | 'text' | 'document';

/** One row of the facts checklist (PropertyIntelligenceService.view). */
export interface AssetFact {
  key: string;
  label: string;
  unit: string | null;
  type: FactValueType;
  critical: boolean;
  settledBy: 'record' | 'seller' | 'professional';
  help: string;
  status: FactStatus;
  value: number | boolean | string | null;
  source: string | null;
  sourceUrl: string | null;
  documentId: string | null;
  note: string | null;
  observedAt: string | null;
}

/** A fact's value as a person reads it: "12.4 acres", "Yes", "$84,000/yr". */
export function factValueText(f: Pick<AssetFact, 'value' | 'unit' | 'type' | 'documentId'>): string | null {
  const v = f.value;
  if (v == null) return f.documentId ? 'Document on file' : null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    const n = v.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (!f.unit) return n;
    if (f.unit.startsWith('$')) return `$${n}${f.unit.slice(1)}`;
    if (f.unit === '%') return `${n}%`;
    return `${n} ${f.unit}`;
  }
  return String(v);
}

// ----------------------------------------------------------- diligence

export type DiligenceStage = 'before_offer' | 'before_contract' | 'before_marketing' | 'before_closing';

export const DILIGENCE_STAGES: readonly DiligenceStage[] = ['before_offer', 'before_contract', 'before_marketing', 'before_closing'];

export const DILIGENCE_STAGE_LABEL: Record<DiligenceStage, string> = {
  before_offer: 'Before an offer',
  before_contract: 'Before signing',
  before_marketing: 'Before marketing to buyers',
  before_closing: 'Before closing',
};

export interface DiligenceStatusItem {
  key: string;
  label: string;
  stage: DiligenceStage;
  factKey?: string;
  document?: boolean;
  from: string;
  help: string;
  status: 'done' | 'reported' | 'open';
  detail: string;
}

// ---------------------------------------------------------- asset view

/** GET /properties/:id/asset: the classification, its facts and diligence. */
export interface AssetView {
  id: string;
  label: string;
  assetClass: AssetClass | null;
  assetSubtype: string | null;
  /** rules | mapping | operator; null when nothing has decided it. */
  basis: 'rules' | 'mapping' | 'operator' | null;
  confidence: 'high' | 'medium' | 'low' | null;
  reasons: string[];
  setAt: string | null;
  suggestion: { assetClass: AssetClass; subtype: string | null } | null;
  unresolved: string | null;
  developmentIndicators: string[];
  providerLabels: string[];
  useCode: string | null;
  codeMapping: { assetClass: string; subtype: string | null; county: string | null } | null;
  dataSource: string | null;
  dataUpdatedAt: string | null;
  facts: AssetFact[];
  criticalUnknowns: string[];
  diligence: DiligenceStatusItem[];
  canCheckPublicRecords: boolean;
}

export const BASIS_TEXT: Record<'rules' | 'mapping' | 'operator', string> = {
  rules: "Halo's classification rules, from what the record says about the parcel",
  mapping: 'A county use code you confirmed',
  operator: 'Set by a person',
};

// -------------------------------------------------------- underwriting

export type AssetDecision = 'pursue' | 'review' | 'pass';

export const ASSET_DECISION_LABEL: Record<AssetDecision, string> = {
  pursue: 'Pursue',
  review: 'Review first',
  pass: 'Pass',
};

export const ASSET_DECISION_VARIANT: Record<AssetDecision, 'success' | 'warning' | 'destructive'> = {
  pursue: 'success',
  review: 'warning',
  pass: 'destructive',
};

export type UnderwritingStrategy = 'residential_arv' | 'land_comparables' | 'commercial_income_and_sales';

export const STRATEGY_LABEL: Record<UnderwritingStrategy, string> = {
  residential_arv: 'Residential: after-repair value',
  land_comparables: 'Land: comparable land sales per acre',
  commercial_income_and_sales: 'Commercial: income and comparable sales',
};

export interface ValueRange {
  low: number;
  mid: number;
  high: number;
}

export interface ValuationApproach {
  key: string;
  label: string;
  range: ValueRange | null;
  unitValue: ValueRange | null;
  unit: 'acre' | 'sq ft' | 'unit' | null;
  evidenceCount: number;
  note: string;
}

export type EvidenceKind = 'comparable_sale' | 'fact' | 'document' | 'assumption' | 'buyer_demand';

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  comparable_sale: 'Comparable sale',
  fact: 'Property fact',
  document: 'Document',
  assumption: 'Assumption',
  buyer_demand: 'Buyer demand',
};

export interface BuyerDemand {
  level: 'strong' | 'some' | 'none' | 'unknown';
  matchingBuyers: number;
  detail: string;
}

export const DEMAND_LABEL: Record<BuyerDemand['level'], string> = {
  strong: 'Strong',
  some: 'Some',
  none: 'None found',
  unknown: 'Not known yet',
};

export interface SensitivityCell {
  capRate: number;
  noiChange: number;
  value: number;
}

/** GET /deals/:dealId/asset-underwriting (AssetUnderwritingService.forDeal). */
export interface DealUnderwriting {
  assetClass: AssetClass;
  subtype: string | null;
  strategy: UnderwritingStrategy;
  valuation: ValueRange | null;
  approaches: ValuationApproach[];
  evidence: Array<{ kind: EvidenceKind; text: string; ref?: string | null }>;
  confidence: { score: number; level: 'high' | 'medium' | 'low' };
  missing: string[];
  risks: string[];
  assumptions: string[];
  offerRange: { low: number; high: number } | null;
  targetFee: number;
  expectedBuyerPrice: number | null;
  expectedNet: number | null;
  buyerDemand: BuyerDemand;
  decision: AssetDecision;
  summary: string;
  explanation: string[];
  sensitivity: SensitivityCell[] | null;
  /** The property has no asset class: the residential model is used until a person confirms one. */
  unclassified: boolean;
  computedAt: string;
}

export function usd(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** "$120,000 to $150,000": a range, never one precise figure. */
export function rangeText(r: { low: number; high: number } | null | undefined): string | null {
  if (!r) return null;
  return r.low === r.high ? `about ${usd(r.low)}` : `${usd(r.low)} to ${usd(r.high)}`;
}

export function percent(fraction: number, digits = 1): string {
  return `${(Math.round(fraction * 100 * 10 ** digits) / 10 ** digits).toLocaleString('en-US')}%`;
}
