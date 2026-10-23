import { partyKey } from './entities';
import { countyName, metroForCounty } from './metros';
import type { NormalizedSale } from './records';
import type { ActivationStatus, MarketClassification } from '../markets/policy';

/**
 * Market intelligence (docs/data-pipeline.md s5): which metros, counties and
 * zips look worth working, and which states to activate next. Deterministic and
 * explained: every point names its basis, and a basis is one of
 * `recorded` (public records Halo holds), `halo` (Halo's own closed deals),
 * `policy` (the market's legal standing), `estimate` (a rule of thumb, said
 * as such) or `unknown` (no data, scored low rather than guessed).
 */

export type GeoLevel = 'metro' | 'county' | 'zip';
export type Basis = 'recorded' | 'halo' | 'policy' | 'estimate' | 'unknown';

export interface GeoStats {
  level: GeoLevel;
  key: string;
  label: string;
  /** The state used for legal standing: a metro's principal-city state. */
  state: string;
  /** Every state the sales came from; a metro can span several. */
  states?: string[];
  sales12m: number;
  medianPrice: number | null;
  investorPurchases12m: number;
  distinctInvestors12m: number;
  cashShare: number | null;
  resales: number;
  medianResaleSpread: number | null;
  latestSale: string | null;
  sources: string[];
  /** Filled by the caller from Halo's own records. */
  distressLeads: number;
  haloClosed: number;
  haloMedianFee: number | null;
  haloMedianDaysToClose: number | null;
  marketStatus: ActivationStatus | null;
  classification: MarketClassification | null;
}

export interface Component {
  key: string;
  label: string;
  points: number;
  max: number;
  basis: Basis;
  detail: string;
}

export interface ScoredGeo extends GeoStats {
  score: number;
  /** Score without the legal component: the opportunity alone. */
  opportunity: number;
  components: Component[];
}

const DAY = 86_400_000;

function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** The key a sale is grouped under at a level; null when it cannot be placed. */
export function geoKey(s: Pick<NormalizedSale, 'state' | 'county' | 'countyFips' | 'zip'>, level: GeoLevel): string | null {
  if (level === 'metro') return metroForCounty(s.countyFips)?.code ?? null;
  if (level === 'county') {
    return s.countyFips ?? (s.county ? `${s.state}:${s.county.toUpperCase().replace(/\s+COUNTY$/, '')}` : null);
  }
  return s.zip ? s.zip.slice(0, 5) : null;
}

/**
 * Group recorded sales into metros, counties or zips over the last 12
 * months. A sale reaches a metro only through its county FIPS; sales in a
 * county outside every metro are left out of the metro level.
 */
export function aggregateSales(sales: NormalizedSale[], level: GeoLevel, asOf: Date): GeoStats[] {
  const since = new Date(asOf.getTime() - 365 * DAY).toISOString().slice(0, 10);
  const groups = new Map<string, NormalizedSale[]>();
  for (const s of sales) {
    const key = geoKey(s, level);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }
  const out: GeoStats[] = [];
  for (const [key, all] of groups) {
    const recent = all.filter((s) => s.saleDate >= since && s.saleDate <= asOf.toISOString().slice(0, 10));
    const investorSales = recent.filter(
      (s) => s.buyerKind === 'company' || s.buyerKind === 'trust' || s.cashPurchase === true,
    );
    const investors = new Set(
      investorSales.map((s) => partyKey(s.buyerName, s.buyerMailingZip)).filter(Boolean) as string[],
    );
    const withCash = recent.filter((s) => s.cashPurchase != null);
    // Resale spread: the same parcel bought and sold on by the same party within 18 months.
    const spreads: number[] = [];
    const byParcel = new Map<string, NormalizedSale[]>();
    for (const s of all) {
      const pk = s.apn ?? s.address;
      if (!pk || s.price == null) continue;
      const list = byParcel.get(pk) ?? [];
      list.push(s);
      byParcel.set(pk, list);
    }
    for (const list of byParcel.values()) {
      const sorted = [...list].sort((a, b) => a.saleDate.localeCompare(b.saleDate));
      for (let i = 0; i + 1 < sorted.length; i++) {
        const buy = sorted[i];
        const sell = sorted[i + 1];
        const sameParty = partyKey(buy.buyerName, null) && partyKey(buy.buyerName, null) === partyKey(sell.sellerName, null);
        const gap = (Date.parse(sell.saleDate) - Date.parse(buy.saleDate)) / DAY;
        if (sameParty && gap > 0 && gap <= 548 && sell.saleDate >= since) spreads.push(sell.price! - buy.price!);
      }
    }
    const first = all[0];
    const metro = level === 'metro' ? metroForCounty(first.countyFips) : null;
    // Area pulls carry a county FIPS but no name; the delineation names most counties.
    const county = first.county ?? countyName(first.countyFips);
    out.push({
      level,
      key,
      label: metro
        ? `${metro.title}${metro.metropolitan ? '' : ' (micropolitan)'}`
        : level === 'county'
          ? `${county ?? key}${county && !/county|parish|borough|municipality|census area|region|city$/i.test(county) ? ' County' : ''}, ${first.state}`
          : `${key}${first.city ? ` (${first.city}, ${first.state})` : `, ${first.state}`}`,
      state: metro?.states[0] ?? first.state,
      states: Array.from(new Set(all.map((s) => s.state))).sort(),
      sales12m: recent.length,
      medianPrice: median(recent.map((s) => s.price).filter((p): p is number => p != null)),
      investorPurchases12m: investorSales.length,
      distinctInvestors12m: investors.size,
      cashShare: withCash.length ? withCash.filter((s) => s.cashPurchase).length / withCash.length : null,
      resales: spreads.length,
      medianResaleSpread: median(spreads),
      latestSale: all.map((s) => s.saleDate).sort().pop() ?? null,
      sources: Array.from(new Set(all.map((s) => s.source))).sort(),
      distressLeads: 0,
      haloClosed: 0,
      haloMedianFee: null,
      haloMedianDaysToClose: null,
      marketStatus: null,
      classification: null,
    });
  }
  return out;
}

const LEGAL_POINTS: Record<ActivationStatus, number> = {
  ACTIVE: 15,
  APPROVED_FOR_DISPOSITION: 13,
  APPROVED_FOR_ACQUISITION: 10,
  PENDING_REQUIREMENTS: 7,
  PENDING_LEGAL_REVIEW: 5,
  RESEARCH_ONLY: 3,
  RESTRICTED: 1,
  BLOCKED: 0,
};

/** Score one geography out of 100, with every component explained. */
export function scoreGeo(g: GeoStats, asOf: Date): ScoredGeo {
  const c: Component[] = [];
  const push = (key: string, label: string, points: number, max: number, basis: Basis, detail: string) =>
    c.push({ key, label, points, max, basis, detail });

  // 1. Legal availability.
  if (!g.marketStatus) {
    push('legal', 'Legal availability', 0, 15, 'unknown', 'No market record.');
  } else {
    const e = g.classification === 'E' ? Math.min(1, LEGAL_POINTS[g.marketStatus]) : LEGAL_POINTS[g.marketStatus];
    push('legal', 'Legal availability', e, 15, 'policy', `${g.marketStatus.replace(/_/g, ' ').toLowerCase()}${g.classification ? `, class ${g.classification}` : ''}.`);
  }

  // 2. Wholesale profitability: what investors actually made reselling.
  if (g.resales >= 3 && g.medianResaleSpread != null) {
    const s = g.medianResaleSpread;
    push('profitability', 'Resale spread', s >= 40_000 ? 15 : s >= 25_000 ? 11 : s >= 15_000 ? 7 : s >= 5_000 ? 3 : 0, 15, 'recorded', `Median spread ${money(s)} over ${g.resales} recorded resales.`);
  } else {
    push('profitability', 'Resale spread', 2, 15, 'unknown', `Too few recorded resales (${g.resales}) to measure.`);
  }

  // 3. Verified investor activity.
  const inv = g.distinctInvestors12m;
  push('investors', 'Investor and cash-buyer activity', inv >= 25 ? 15 : inv >= 10 ? 11 : inv >= 5 ? 7 : inv >= 1 ? 3 : 0, 15, 'recorded', `${inv} distinct investor buyer(s), ${g.investorPurchases12m} investor purchase(s) in 12 months.`);

  // 4. Distressed opportunities.
  const dl = g.distressLeads;
  push('distress', 'Distressed opportunities', dl >= 50 ? 10 : dl >= 20 ? 7 : dl >= 5 ? 4 : dl >= 1 ? 2 : 0, 10, dl ? 'halo' : 'unknown', `${dl} lead(s) with distress signals (foreclosure, tax delinquency, liens).`);

  // 5. Acquisition competition: a high investor share means more buyers chase each seller.
  if (g.sales12m >= 10) {
    const share = g.investorPurchases12m / g.sales12m;
    push('competition', 'Low acquisition competition', share < 0.15 ? 8 : share < 0.3 ? 5 : share < 0.45 ? 2 : 0, 8, 'recorded', `${Math.round(share * 100)}% of sales went to investors.`);
  } else {
    push('competition', 'Low acquisition competition', 3, 8, 'unknown', 'Too few sales to judge competition.');
  }

  // 6. Values and comparables.
  const mp = g.medianPrice;
  if (mp == null) {
    push('values', 'Property values and comps', 0, 7, 'unknown', 'No sale prices on record.');
  } else {
    const band = mp >= 80_000 && mp <= 350_000 ? 5 : (mp >= 50_000 && mp < 80_000) || (mp > 350_000 && mp <= 500_000) ? 3 : 1;
    const comps = g.sales12m >= 20 ? 2 : g.sales12m >= 8 ? 1 : 0;
    push('values', 'Property values and comps', band + comps, 7, 'recorded', `Median ${money(mp)}; ${g.sales12m} sale(s) for comps.`);
  }

  // 7. Assignment-fee potential: Halo's own fees when it has them, else a rule of thumb.
  if (g.haloMedianFee != null && g.haloClosed >= 2) {
    const f = g.haloMedianFee;
    push('fee', 'Assignment-fee potential', f >= 25_000 ? 10 : f >= 15_000 ? 7 : f >= 8_000 ? 4 : 2, 10, 'halo', `Median realized fee ${money(f)} over ${g.haloClosed} closing(s).`);
  } else if (mp != null) {
    const est = Math.max(5_000, Math.min(40_000, mp * 0.06));
    push('fee', 'Assignment-fee potential', est >= 25_000 ? 8 : est >= 15_000 ? 6 : est >= 8_000 ? 4 : 2, 10, 'estimate', `About ${money(est)}: 6% of the median price, a rule of thumb, not a result.`);
  } else {
    push('fee', 'Assignment-fee potential', 0, 10, 'unknown', 'No price data.');
  }

  // 8. Liquidity.
  const n = g.sales12m;
  push('liquidity', 'Transaction volume', n >= 1000 ? 10 : n >= 300 ? 8 : n >= 100 ? 6 : n >= 30 ? 3 : n > 0 ? 1 : 0, 10, 'recorded', `${n} recorded sale(s) in 12 months.`);

  // 9. Contract-to-close timeline.
  const t = g.haloMedianDaysToClose;
  if (t != null) {
    push('timeline', 'Contract-to-close time', t <= 30 ? 5 : t <= 45 ? 3 : 1, 5, 'halo', `Median ${Math.round(t)} days from contract to close.`);
  } else {
    push('timeline', 'Contract-to-close time', 2, 5, 'unknown', 'No closings here yet.');
  }

  // 10. Data quality and sourcing.
  const fresh = g.latestSale ? (asOf.getTime() - Date.parse(g.latestSale)) / DAY <= 90 : false;
  push(
    'data',
    'Data quality',
    n >= 50 && fresh ? 5 : n >= 10 ? 3 : n > 0 ? 1 : 0,
    5,
    n ? 'recorded' : 'unknown',
    `${g.sources.join(', ') || 'no source'}; latest sale ${g.latestSale ?? 'none'}.`,
  );

  const score = c.reduce((sum, x) => sum + x.points, 0);
  const legal = c.find((x) => x.key === 'legal')!;
  const opportunity = Math.round(((score - legal.points) / (100 - legal.max)) * 100);
  return { ...g, score, opportunity, components: c };
}

export function rankGeos(geos: GeoStats[], asOf: Date): ScoredGeo[] {
  return geos.map((g) => scoreGeo(g, asOf)).sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

const FEASIBILITY: Record<ActivationStatus, number> = {
  ACTIVE: 1,
  APPROVED_FOR_DISPOSITION: 0.95,
  APPROVED_FOR_ACQUISITION: 0.9,
  PENDING_REQUIREMENTS: 0.8,
  PENDING_LEGAL_REVIEW: 0.65,
  RESEARCH_ONLY: 0.5,
  RESTRICTED: 0,
  BLOCKED: 0,
};

const CLASS_FEASIBILITY: Record<MarketClassification, number> = {
  A: 1,
  B: 0.85,
  C: 0.55,
  D: 0.45,
  E: 0.15,
  unclassified: 0.35,
};

export interface MarketRecommendation {
  state: string;
  opportunity: number;
  feasibility: number;
  priority: number;
  status: ActivationStatus;
  classification: MarketClassification;
  topGeos: Array<{ key: string; label: string; opportunity: number }>;
  reasons: string[];
  nextStep: string | null;
}

/**
 * Which states to work on next: expected opportunity (the best counties'
 * scores, legal standing left out) times how close the state is to
 * operating lawfully. Active, restricted and blocked states are not
 * recommended. The answer is a priority for people to act on, never an
 * activation.
 */
export function recommendMarkets(
  states: Array<{ state: string; status: ActivationStatus; classification: MarketClassification; nextStep: string | null; missing: number }>,
  geos: ScoredGeo[],
  limit = 10,
): MarketRecommendation[] {
  const out: MarketRecommendation[] = [];
  for (const s of states) {
    if (s.status === 'ACTIVE' || s.status === 'RESTRICTED' || s.status === 'BLOCKED') continue;
    const mine = geos.filter((g) => g.state === s.state && g.level === 'county').sort((a, b) => b.opportunity - a.opportunity);
    const top3 = mine.slice(0, 3);
    const opportunity = top3.length ? Math.round(top3.reduce((x, g) => x + g.opportunity, 0) / top3.length) : 0;
    const feasibility = Math.round(FEASIBILITY[s.status] * CLASS_FEASIBILITY[s.classification] * 100) / 100;
    const reasons: string[] = [];
    if (top3.length) reasons.push(`Best counties: ${top3.map((g) => `${g.label} (${g.opportunity})`).join(', ')}.`);
    else reasons.push('No recorded sales on file yet: opportunity unknown.');
    reasons.push(`${s.status.replace(/_/g, ' ').toLowerCase()}, class ${s.classification}${s.missing ? `, ${s.missing} item(s) outstanding` : ''}.`);
    out.push({
      state: s.state,
      opportunity,
      feasibility,
      priority: Math.round(opportunity * feasibility),
      status: s.status,
      classification: s.classification,
      topGeos: top3.map((g) => ({ key: g.key, label: g.label, opportunity: g.opportunity })),
      reasons,
      nextStep: s.nextStep,
    });
  }
  return out.sort((a, b) => b.priority - a.priority || b.feasibility - a.feasibility || a.state.localeCompare(b.state)).slice(0, limit);
}
