import { ASSET_CLASS_LABEL, type AssetClass } from './assets';

/**
 * Sourcing markets by asset class (docs/asset-classes.md s3): the filters
 * each class takes, the form that edits them, and the run and estimate
 * results. They mirror apps/api/src/sourcing and
 * packages/shared/src/assets/sourcing.ts; the api is the source of truth.
 */

export interface LandCriteria {
  subtypes?: string[];
  counties?: string[];
  minAcres?: number;
  maxAcres?: number;
  vacantOnly?: boolean;
  landUse?: string[];
  minAssessed?: number;
  maxAssessed?: number;
  minOwnershipYears?: number;
  absenteeOnly?: boolean;
  taxDelinquentOnly?: boolean;
  liensOnly?: boolean;
  developmentIndicators?: boolean;
}

export interface CommercialCriteria {
  subtypes?: string[];
  counties?: string[];
  minBuildingSqft?: number;
  maxBuildingSqft?: number;
  minLotAcres?: number;
  maxLotAcres?: number;
  minUnits?: number;
  maxUnits?: number;
  minYearBuilt?: number;
  maxYearBuilt?: number;
  minAssessed?: number;
  maxAssessed?: number;
  minOwnershipYears?: number;
  soldSince?: string;
  ownerKinds?: Array<'company' | 'trust' | 'individual'>;
  distressOnly?: boolean;
}

export const OWNER_KINDS = [
  { value: 'company', label: 'Company' },
  { value: 'trust', label: 'Trust' },
  { value: 'individual', label: 'Individual' },
] as const;

// ------------------------------------------------------------- forms

/** Text inputs hold what was typed; numbers are read when the market is saved. */
export const emptyLandForm = {
  subtypes: [] as string[],
  counties: '',
  minAcres: '',
  maxAcres: '',
  vacantOnly: false,
  landUse: '',
  minAssessed: '',
  maxAssessed: '',
  minOwnershipYears: '',
  absenteeOnly: false,
  taxDelinquentOnly: false,
  liensOnly: false,
  developmentIndicators: false,
};
export type LandForm = typeof emptyLandForm;

export const emptyCommercialForm = {
  subtypes: [] as string[],
  counties: '',
  minBuildingSqft: '',
  maxBuildingSqft: '',
  minLotAcres: '',
  maxLotAcres: '',
  minUnits: '',
  maxUnits: '',
  minYearBuilt: '',
  maxYearBuilt: '',
  minAssessed: '',
  maxAssessed: '',
  minOwnershipYears: '',
  soldSince: '',
  ownerKinds: [] as string[],
  distressOnly: false,
};
export type CommercialForm = typeof emptyCommercialForm;

/** "Travis, Hays; Bastrop" -> ["Travis", "Hays", "Bastrop"]. */
export function listOf(text: string): string[] {
  return Array.from(
    new Set(
      text
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

const num = (v: string): number | undefined => {
  if (v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Only the filters that were set: the api's schema is strict and empty lists mean nothing. */
function compact<T extends object>(o: T): T {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && v.length === 0)),
  ) as T;
}

export function landCriteriaFrom(f: LandForm): LandCriteria {
  return compact<LandCriteria>({
    subtypes: f.subtypes,
    counties: listOf(f.counties),
    minAcres: num(f.minAcres),
    maxAcres: num(f.maxAcres),
    vacantOnly: f.vacantOnly,
    landUse: listOf(f.landUse),
    minAssessed: num(f.minAssessed),
    maxAssessed: num(f.maxAssessed),
    minOwnershipYears: num(f.minOwnershipYears),
    absenteeOnly: f.absenteeOnly,
    taxDelinquentOnly: f.taxDelinquentOnly,
    liensOnly: f.liensOnly,
    developmentIndicators: f.developmentIndicators,
  });
}

export function commercialCriteriaFrom(f: CommercialForm): CommercialCriteria {
  return compact<CommercialCriteria>({
    subtypes: f.subtypes,
    counties: listOf(f.counties),
    minBuildingSqft: num(f.minBuildingSqft),
    maxBuildingSqft: num(f.maxBuildingSqft),
    minLotAcres: num(f.minLotAcres),
    maxLotAcres: num(f.maxLotAcres),
    minUnits: num(f.minUnits),
    maxUnits: num(f.maxUnits),
    minYearBuilt: num(f.minYearBuilt),
    maxYearBuilt: num(f.maxYearBuilt),
    minAssessed: num(f.minAssessed),
    maxAssessed: num(f.maxAssessed),
    minOwnershipYears: num(f.minOwnershipYears),
    soldSince: f.soldSince || undefined,
    ownerKinds: f.ownerKinds as CommercialCriteria['ownerKinds'],
    distressOnly: f.distressOnly,
  });
}

/**
 * What is wrong with the filters, in words, before anything is saved: a
 * minimum above its maximum, a number that is not one, too many counties.
 */
export function criteriaProblems(cls: 'land' | 'commercial', f: LandForm | CommercialForm): string[] {
  const out: string[] = [];
  const label = ASSET_CLASS_LABEL[cls];
  const pairs: Array<[string, string, string]> =
    cls === 'land'
      ? [
          ['minAcres', 'maxAcres', 'acreage'],
          ['minAssessed', 'maxAssessed', 'assessed value'],
        ]
      : [
          ['minBuildingSqft', 'maxBuildingSqft', 'building area'],
          ['minLotAcres', 'maxLotAcres', 'lot size'],
          ['minUnits', 'maxUnits', 'units'],
          ['minYearBuilt', 'maxYearBuilt', 'year built'],
          ['minAssessed', 'maxAssessed', 'assessed value'],
        ];
  const fields = f as unknown as Record<string, unknown>;
  for (const [key, v] of Object.entries(fields)) {
    if (typeof v === 'string' && /^(min|max)/.test(key) && v.trim() !== '' && num(v) === undefined) {
      out.push(`${label}: "${v}" is not a number of zero or more.`);
    }
  }
  for (const [lo, hi, what] of pairs) {
    const a = num(String(fields[lo] ?? ''));
    const b = num(String(fields[hi] ?? ''));
    if (a != null && b != null && a > b) out.push(`${label}: the minimum ${what} is above the maximum.`);
  }
  const counties = listOf(String(fields.counties ?? ''));
  if (counties.length > 20) out.push(`${label}: at most 20 counties per market.`);
  if (counties.some((c) => c.length > 100)) out.push(`${label}: a county name is too long.`);
  return out;
}

/**
 * The label Halo would show for a market with no city or ZIP: its counties.
 * The api's own default ("Market, TX") says nothing about where it is.
 */
export function countyMarketLabel(state: string, counties: string[], classes: AssetClass[]): string {
  const st = state.trim().toUpperCase();
  const first = counties[0] ?? '';
  const county = /\b(county|parish|borough)$/i.test(first) ? first : `${first} County`;
  const where = counties.length > 1 ? `${county} and ${counties.length - 1} more` : county;
  const kind =
    classes.length === 1 && classes[0] === 'residential'
      ? ''
      : ` (${classes.map((c) => ASSET_CLASS_LABEL[c].toLowerCase()).join(', ')})`;
  return `${where}, ${st}${kind}`.slice(0, 80);
}

// ----------------------------------------------------------- results

/** The largest small batch a person can run (apps/api/src/sourcing MAX_BATCH), per source. */
export const MAX_BATCH = 25;

export interface MarketOutcome {
  source: string;
  ok: boolean;
  searched?: number;
  created?: number;
  duplicates?: number;
  error?: string;
  /** Records the market's filters set aside, and why (land and commercial pulls). */
  filtered?: number;
  filteredReasons?: Record<string, number>;
  /** Kept, but the asset class needs a person to confirm it. */
  unclassified?: number;
  byClass?: Partial<Record<AssetClass, number>>;
}

export interface MarketResult {
  ranAt: string;
  trigger: string;
  skipped?: string;
  created: number;
  outcomes: MarketOutcome[];
  /** Set when a person ran a small batch. */
  batchLimit?: number;
}

/** A run's outcomes added up across its sources. */
export function totals(result: MarketResult) {
  const reasons: Record<string, number> = {};
  const byClass: Partial<Record<AssetClass, number>> = {};
  let searched = 0;
  let duplicates = 0;
  let filtered = 0;
  let unclassified = 0;
  let reported = false;
  for (const o of result.outcomes ?? []) {
    if (!o.ok) continue;
    searched += o.searched ?? 0;
    duplicates += o.duplicates ?? 0;
    if (o.filtered != null) reported = true;
    filtered += o.filtered ?? 0;
    unclassified += o.unclassified ?? 0;
    for (const [r, n] of Object.entries(o.filteredReasons ?? {})) reasons[r] = (reasons[r] ?? 0) + n;
    for (const [c, n] of Object.entries(o.byClass ?? {})) {
      byClass[c as AssetClass] = (byClass[c as AssetClass] ?? 0) + (n ?? 0);
    }
  }
  return {
    searched,
    created: result.created,
    duplicates,
    filtered,
    unclassified,
    /** Whether any source reported filtering (residential-only pulls do not). */
    reported,
    reasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]),
    byClass,
  };
}

// ---------------------------------------------------------- estimate

export type FilterSupport = 'provider' | 'halo' | 'none';

export const SUPPORT_LABEL: Record<FilterSupport, string> = {
  provider: 'Provider filters',
  halo: 'Halo filters after the pull',
  none: 'Not returned',
};

export const SUPPORT_VARIANT: Record<FilterSupport, 'success' | 'info' | 'outline'> = {
  provider: 'success',
  halo: 'info',
  none: 'outline',
};

export interface SourcingEstimate {
  perSource: Array<{ source: string; maxCallsPerRun: number; unitCostUsd: number; maxUsdPerRun: number; note: string }>;
  maxUsdPerRun: number;
  runsPerMonth: number;
  maxUsdPerMonth: number;
  coverage: Array<{
    filter: string;
    label: string;
    assetClasses: AssetClass[];
    note?: string;
    /** Per selected source (MLS is not listed): who applies the filter. */
    support: Record<string, FilterSupport>;
  }>;
  status: Array<{
    assetClass: AssetClass;
    label: string;
    effectiveStatus: string | null;
    researchOnly: boolean;
    sellerOutreach: { allowed: boolean; reason: string };
    summary: string;
    nationwide: boolean;
  }>;
}

/** Dollars at the precision a rate card supports: "$0.40", "$12", "under $0.01". */
export function dollars(n: number): string {
  if (n === 0) return '$0';
  if (n < 0.01) return 'under $0.01';
  return n < 100 ? `$${n.toFixed(2)}` : `$${Math.round(n).toLocaleString('en-US')}`;
}
