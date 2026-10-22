import { partyKey, normalizePartyName, type PartyKind } from './entities';
import type { NormalizedSale } from './records';

/**
 * Investor discovery from recorded sales (docs/data-pipeline.md s4). A
 * company, trust or repeat buyer who keeps buying, often for cash, is a
 * likely cash buyer. What a record shows (they bought) is kept apart from
 * what Halo infers (their buy box) and from what only they can tell us
 * (that they would buy now, with funds ready): discovery produces
 * candidates with evidence, never offers or proof of funds.
 */

export interface InvestorPurchase {
  sourceRef: string;
  saleDate: string;
  price: number | null;
  state: string;
  county: string | null;
  city: string | null;
  zip: string | null;
  cashPurchase: boolean | null;
  propertyType: string | null;
}

export interface InvestorCandidate {
  key: string;
  name: string;
  kind: PartyKind;
  mailingZip: string | null;
  purchases: InvestorPurchase[];
  /** Purchases in the window. */
  purchaseCount: number;
  cashPurchases: number;
  /** Purchases with a recorded mortgage. */
  financedPurchases: number;
  /** Properties they bought and resold within 18 months. */
  resales: number;
  medianHoldDays: number | null;
  firstPurchase: string;
  lastPurchase: string;
  /** Inferred from the purchases: where, at what price, what type. */
  buyBox: {
    states: string[];
    counties: string[];
    cities: string[];
    zips: string[];
    priceMin: number | null;
    priceMax: number | null;
    propertyTypes: string[];
  };
  score: number;
  reasons: string[];
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function roundTo(n: number | null, step: number): number | null {
  return n == null ? null : Math.round(n / step) * step;
}

const DAY = 86_400_000;

/** The same parcel: by APN when both records have one, else by address. */
function sameParcel(a: NormalizedSale, b: NormalizedSale): boolean {
  if (a.apn && b.apn) return a.apn === b.apn;
  return !!a.address && !!b.address && normalizePartyName(a.address) === normalizePartyName(b.address);
}
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);

function top<T extends string>(values: Array<T | null>, n: number): T[] {
  const counts = new Map<T, number>();
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([v]) => v);
}

/**
 * Group recorded sales by buyer and keep the ones that look like investors:
 * companies, trusts and individuals who bought at least `minPurchases`
 * times in the window. Lenders and agencies (foreclosures, REO) are not
 * investors and are skipped.
 */
export function discoverInvestors(
  sales: NormalizedSale[],
  opts: { asOf: Date; windowDays?: number; minPurchases?: number },
): InvestorCandidate[] {
  const windowDays = opts.windowDays ?? 730;
  const minPurchases = opts.minPurchases ?? 2;
  const since = new Date(opts.asOf.getTime() - windowDays * DAY).toISOString().slice(0, 10);
  const asOf = opts.asOf.toISOString().slice(0, 10);

  // A buyer's later sale of the same parcel is a resale.
  const soldBy = new Map<string, NormalizedSale[]>();
  for (const s of sales) {
    const k = partyKey(s.sellerName, null);
    if (!k) continue;
    const list = soldBy.get(k) ?? [];
    list.push(s);
    soldBy.set(k, list);
  }

  const groups = new Map<string, NormalizedSale[]>();
  for (const s of sales) {
    if (s.saleDate < since || s.saleDate > asOf) continue;
    if (s.buyerKind === 'lender' || s.buyerKind === 'government') continue;
    if (s.armsLength === false) continue;
    const key = partyKey(s.buyerName, s.buyerMailingZip);
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(s);
    groups.set(key, list);
  }

  const out: InvestorCandidate[] = [];
  for (const [key, list] of groups) {
    if (list.length < minPurchases) continue;
    const sorted = [...list].sort((a, b) => a.saleDate.localeCompare(b.saleDate));
    const kind = (sorted[0].buyerKind ?? 'individual') as PartyKind;
    const prices = sorted.map((s) => s.price).filter((p): p is number => p != null).sort((a, b) => a - b);
    // Resales: the same parcel (by APN, else address) sold on by this buyer within 18 months.
    const companyKey = partyKey(sorted[0].buyerName, null);
    const theirSales = companyKey ? (soldBy.get(companyKey) ?? []) : [];
    const holds: number[] = [];
    for (const buy of sorted) {
      const resale = theirSales.find(
        (s) =>
          s.saleDate > buy.saleDate &&
          sameParcel(buy, s) &&
          days(buy.saleDate, s.saleDate) <= 548,
      );
      if (resale) holds.push(days(buy.saleDate, resale.saleDate));
    }
    holds.sort((a, b) => a - b);
    const cash = sorted.filter((s) => s.cashPurchase === true).length;
    const financed = sorted.filter((s) => s.cashPurchase === false).length;
    const last = sorted[sorted.length - 1].saleDate;
    const recencyDays = days(last, asOf);

    const reasons: string[] = [`${sorted.length} recorded purchase(s) since ${since}`];
    let score = Math.min(40, sorted.length * 8);
    if (cash) {
      score += Math.round((cash / sorted.length) * 25);
      reasons.push(`${cash} with no purchase mortgage recorded`);
    }
    if (holds.length) {
      score += Math.min(15, holds.length * 5);
      reasons.push(`${holds.length} resold within 18 months`);
    }
    if (recencyDays <= 90) {
      score += 15;
      reasons.push('bought in the last 90 days');
    } else if (recencyDays <= 365) {
      score += 8;
    } else {
      reasons.push(`last purchase ${recencyDays} days ago`);
    }
    if (kind === 'company' || kind === 'trust') score += 5;

    out.push({
      key,
      name: sorted[sorted.length - 1].buyerName ?? key,
      kind,
      mailingZip: sorted.find((s) => s.buyerMailingZip)?.buyerMailingZip ?? null,
      purchases: sorted.map((s) => ({
        sourceRef: `${s.source}:${s.sourceRef}`,
        saleDate: s.saleDate,
        price: s.price,
        state: s.state,
        county: s.county,
        city: s.city,
        zip: s.zip,
        cashPurchase: s.cashPurchase,
        propertyType: s.propertyType,
      })),
      purchaseCount: sorted.length,
      cashPurchases: cash,
      financedPurchases: financed,
      resales: holds.length,
      medianHoldDays: quantile(holds, 0.5),
      firstPurchase: sorted[0].saleDate,
      lastPurchase: last,
      buyBox: {
        states: top(sorted.map((s) => s.state), 5),
        counties: top(sorted.map((s) => s.county), 5),
        cities: top(sorted.map((s) => s.city), 8),
        zips: top(sorted.map((s) => s.zip), 10),
        priceMin: roundTo(quantile(prices, 0.1), 5_000),
        priceMax: roundTo(quantile(prices, 0.9), 5_000),
        propertyTypes: top(sorted.map((s) => s.propertyType), 4),
      },
      score: Math.min(100, score),
      reasons,
    });
  }
  return out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}
