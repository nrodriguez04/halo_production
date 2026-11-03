import type {
  BuyerStatus,
  BuyerTransactionSource,
  FundingType,
  PofStatus,
} from './types';
import { normalizeCounty } from '../assets/parcel';
import { ASSET_CLASS_LABEL, ASSET_SUBTYPE_LABEL, isAssetClass, type AssetClass, type AssetSubtype } from '../assets/taxonomy';

/**
 * Which cash buyers fit a deal, and why. Deterministic: the same records
 * give the same order, every point is explained, and every explanation names
 * the kind of evidence behind it.
 *
 * The evidence kinds are kept apart on purpose. A buyer's stated buy box is
 * what they told us; a purchase in the public record is what they did; an
 * inferred capacity is our guess from those purchases; verified proof of
 * funds is a document a person checked; expressed interest and offers are
 * replies to us. Only the last two are demand, and nothing here turns the
 * others into it.
 */

export type MatchEvidenceKind =
  | 'stated_preference'
  | 'historical_purchase'
  | 'inferred_capacity'
  | 'verified_pof'
  | 'unverified_pof'
  | 'expressed_interest'
  | 'offer'
  | 'closing';

export interface MatchEvidence {
  kind: MatchEvidenceKind;
  text: string;
}

export interface RankingDeal {
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyType: string | null;
  /** What buyers are asked to pay (never the seller-side price). */
  buyerPrice: number | null;
  arv: number | null;
  repairEstimate: number | null;
  /** Land and commercial deals (docs/asset-classes.md s6). Null or absent: residential rules. */
  assetClass?: AssetClass | null;
  assetSubtype?: string | null;
  county?: string | null;
  acres?: number | null;
  buildingSqft?: number | null;
  units?: number | null;
  /** NOI / buyer price, when a verified NOI supports one. */
  capRate?: number | null;
}

export interface BuyBox {
  /** Cities, two-letter states or zips, any case. */
  locations: string[];
  propertyTypes: string[];
  priceMin: number | null;
  priceMax: number | null;
  maxRepairs: number | null;
  minArv: number | null;
  /** What the buyer told us they buy. Empty: not stated. */
  assetClasses?: AssetClass[];
  assetSubtypes?: string[];
  counties?: string[];
  acresMin?: number | null;
  acresMax?: number | null;
  sqftMin?: number | null;
  sqftMax?: number | null;
  unitsMin?: number | null;
  unitsMax?: number | null;
  zoning?: string[];
  /** Their minimum going-in cap rate, as a fraction. */
  minCapRate?: number | null;
}

export interface RankingTransaction {
  city: string | null;
  state: string | null;
  zip: string | null;
  propertyType: string | null;
  price: number | null;
  closedAt: Date | null;
  source: BuyerTransactionSource;
  assetClass?: AssetClass | null;
  acres?: number | null;
  buildingSqft?: number | null;
  county?: string | null;
}

export interface RankingBuyer {
  id: string;
  name: string;
  status: BuyerStatus;
  hasEmail: boolean;
  hasPhone: boolean;
  /** An active email consent on file (a buyer may only be emailed with one). */
  emailConsent: boolean;
  smsConsent: boolean;
  /** On the tenant's do-not-contact list. */
  optedOut: boolean;
  buyBox: BuyBox;
  fundingType: FundingType;
  pof: {
    status: PofStatus;
    amount: number | null;
    expiresAt: Date | null;
  };
  transactions: RankingTransaction[];
  engagement: {
    /** Messages we sent them. */
    sent: number;
    /** Replies of any kind. */
    replies: number;
    /** Replies classified interested, offers, or deal-page interest. */
    interested: number;
  };
  /** Offers they made on our deals and how those ended. */
  outcomes: {
    offers: number;
    accepted: number;
    closed: number;
    /** Accepted (or assigned) then walked away or failed to fund. */
    fellThrough: number;
  };
}

export interface BuyerMatch {
  buyerId: string;
  name: string;
  /** 0-100. */
  score: number;
  /** Whether the buyer can be offered this deal at all. */
  contactable: boolean;
  /** Why not, when not. */
  excludedReasons: string[];
  /** Hard mismatches with the stated buy box (still listed, ranked low). */
  mismatches: string[];
  components: {
    location: number;
    price: number;
    propertyType: number;
    condition: number;
    trackRecord: number;
    funding: number;
    engagement: number;
    reliability: number;
  };
  evidence: MatchEvidence[];
  /** Purchases on record: their range, for the buyer card. */
  historicalRange: { min: number; max: number; count: number } | null;
  /** The most we think they could pay, from purchases and stated range. An estimate. */
  inferredCapacity: number | null;
  /** Channels they can be contacted on now. */
  channels: Array<'email' | 'sms'>;
}

const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RECENT_YEARS = 2;

function money(n: number): string {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

function isVerifiedSource(s: BuyerTransactionSource): boolean {
  return s === 'public_record' || s === 'halo_closing';
}

/** The ranking for one buyer. `now` is passed in so the result is reproducible. */
export function matchBuyerToDeal(
  deal: RankingDeal,
  buyer: RankingBuyer,
  now: Date,
): BuyerMatch {
  const evidence: MatchEvidence[] = [];
  const mismatches: string[] = [];
  const excludedReasons: string[] = [];
  const city = norm(deal.city);
  const state = norm(deal.state);
  const zip = norm(deal.zip);
  const type = norm(deal.propertyType);
  const price = deal.buyerPrice;
  const assetClass = isAssetClass(deal.assetClass) ? deal.assetClass : null;
  const nonResidential = assetClass === 'land' || assetClass === 'commercial';
  // A land deal counts only land purchases as track record; a house deal
  // ignores a buyer's land and commercial purchases. Unclassified
  // purchases are the residential history Halo recorded before classes.
  const relevant = buyer.transactions.filter((t) =>
    nonResidential ? t.assetClass === assetClass : !t.assetClass || t.assetClass === 'residential',
  );

  // ------------------------------------------------------------ location
  const locations = buyer.buyBox.locations.map(norm).filter(Boolean);
  const recent = relevant.filter(
    (t) =>
      !t.closedAt ||
      now.getTime() - t.closedAt.getTime() <= RECENT_YEARS * YEAR_MS,
  );
  const inZip = recent.filter((t) => zip && norm(t.zip) === zip);
  const inCity = recent.filter(
    (t) => city && norm(t.city) === city && norm(t.state) === state,
  );
  const inState = recent.filter((t) => state && norm(t.state) === state);

  let location = 0;
  if (zip && locations.includes(zip)) {
    location = 30;
    evidence.push({ kind: 'stated_preference', text: `Buys in ${deal.zip}` });
  } else if (city && locations.includes(city)) {
    location = 26;
    evidence.push({ kind: 'stated_preference', text: `Buys in ${deal.city}` });
  } else if (
    deal.county &&
    (buyer.buyBox.counties ?? []).map(normalizeCounty).includes(normalizeCounty(deal.county))
  ) {
    location = 22;
    evidence.push({
      kind: 'stated_preference',
      text: `Buys in ${deal.county}`,
    });
  } else if (state && locations.includes(state)) {
    location = 14;
    evidence.push({
      kind: 'stated_preference',
      text: `Buys anywhere in ${deal.state}`,
    });
  } else if (locations.length > 0) {
    mismatches.push(`outside stated locations (${locations.join(', ')})`);
  }
  // A purchase nearby is evidence too, and outranks a stated state-wide box.
  if (inZip.length > 0) location = Math.max(location, 30);
  else if (inCity.length > 0) location = Math.max(location, 24);
  else if (locations.length === 0 && inState.length > 0)
    location = Math.max(location, 10);
  if (locations.length === 0 && location === 0) location = 6;

  // ------------------------------------------------------- track record
  let trackRecord = 0;
  const weigh = (ts: RankingTransaction[]) =>
    ts.reduce((n, t) => n + (isVerifiedSource(t.source) ? 1 : 0.5), 0);
  const nearWeight = weigh(inZip.length ? inZip : inCity);
  if (nearWeight >= 2) trackRecord = 15;
  else if (nearWeight >= 1) trackRecord = 11;
  else if (nearWeight > 0) trackRecord = 7;
  else if (weigh(inState) > 0) trackRecord = 4;
  const near = inZip.length ? inZip : inCity;
  if (near.length > 0) {
    const verified = near.filter((t) => isVerifiedSource(t.source)).length;
    evidence.push({
      kind: 'historical_purchase',
      text:
        `${near.length} purchase(s) in ${inZip.length ? deal.zip : deal.city} in the last ${RECENT_YEARS} years` +
        (verified === near.length
          ? ' (public record)'
          : verified > 0
            ? ` (${verified} public record, ${near.length - verified} reported by the buyer)`
            : ' (reported by the buyer, not verified)'),
    });
  } else if (inState.length > 0) {
    evidence.push({
      kind: 'historical_purchase',
      text: `${inState.length} purchase(s) elsewhere in ${deal.state} in the last ${RECENT_YEARS} years`,
    });
  }

  // ------------------------------------------- purchase range + capacity
  const prices = relevant
    .map((t) => t.price)
    .filter((p): p is number => typeof p === 'number' && p > 0);
  const historicalRange = prices.length
    ? {
        min: Math.min(...prices),
        max: Math.max(...prices),
        count: prices.length,
      }
    : null;
  const capacityCandidates = [
    historicalRange?.max ?? null,
    buyer.buyBox.priceMax,
    buyer.pof.status === 'verified' ? buyer.pof.amount : null,
  ].filter((n): n is number => typeof n === 'number' && n > 0);
  const inferredCapacity = capacityCandidates.length
    ? Math.max(...capacityCandidates)
    : null;
  if (historicalRange) {
    evidence.push({
      kind: 'historical_purchase',
      text: `Past purchases ${money(historicalRange.min)}-${money(historicalRange.max)} (${historicalRange.count})`,
    });
  }

  // --------------------------------------------------------------- price
  let priceScore = 0;
  const { priceMin, priceMax } = buyer.buyBox;
  const hasRange = priceMin != null || priceMax != null;
  if (price == null) {
    priceScore = 6;
  } else if (hasRange) {
    const lo = priceMin ?? 0;
    const hi = priceMax ?? Number.POSITIVE_INFINITY;
    if (price >= lo && price <= hi) {
      priceScore = 20;
      evidence.push({
        kind: 'stated_preference',
        text: `Price ${money(price)} is in their stated range`,
      });
    } else if (price >= lo * 0.85 && price <= hi * 1.15) {
      priceScore = 10;
      evidence.push({
        kind: 'stated_preference',
        text: `Price ${money(price)} is within 15% of their stated range`,
      });
    } else {
      mismatches.push(`price ${money(price)} outside stated range`);
    }
  } else if (historicalRange) {
    if (
      price >= historicalRange.min * 0.8 &&
      price <= historicalRange.max * 1.2
    ) {
      priceScore = 14;
    } else {
      priceScore = 3;
    }
  } else {
    priceScore = 6;
  }
  if (inferredCapacity != null && price != null && price > inferredCapacity * 1.25) {
    mismatches.push(
      `price ${money(price)} is well above anything they are known to have paid or proven`,
    );
    priceScore = Math.min(priceScore, 4);
  }
  if (inferredCapacity != null) {
    evidence.push({
      kind: 'inferred_capacity',
      text: `Estimated capacity about ${money(inferredCapacity)} (an inference, not a commitment)`,
    });
  }

  // ------------------------------------------------------- property type
  const types = buyer.buyBox.propertyTypes.map(norm).filter(Boolean);
  let propertyType = 5;
  const statedClasses = buyer.buyBox.assetClasses ?? [];
  if (assetClass && statedClasses.length > 0) {
    // A stated asset class decides fit; a stated subtype narrows it.
    if (!statedClasses.includes(assetClass)) {
      propertyType = 0;
      mismatches.push(`buys ${statedClasses.map((c) => ASSET_CLASS_LABEL[c].toLowerCase()).join(', ')}, not ${ASSET_CLASS_LABEL[assetClass].toLowerCase()}`);
    } else {
      const subtypes = buyer.buyBox.assetSubtypes ?? [];
      if (deal.assetSubtype && subtypes.length > 0 && !subtypes.includes(deal.assetSubtype)) {
        propertyType = 2;
        mismatches.push(`subtype ${ASSET_SUBTYPE_LABEL[deal.assetSubtype as AssetSubtype] ?? deal.assetSubtype} not among those they buy`);
      } else {
        evidence.push({ kind: 'stated_preference', text: `Buys ${ASSET_CLASS_LABEL[assetClass].toLowerCase()}` });
      }
    }
  } else if (nonResidential) {
    // Nothing stated: what they bought is the only evidence, and it is an inference.
    const same = buyer.transactions.filter((t) => t.assetClass === assetClass).length;
    const classed = buyer.transactions.filter((t) => t.assetClass).length;
    if (same > 0) {
      evidence.push({
        kind: 'historical_purchase',
        text: `Bought ${same} ${ASSET_CLASS_LABEL[assetClass!].toLowerCase()} propert${same === 1 ? 'y' : 'ies'} on record (inferred interest, not confirmed)`,
      });
    } else {
      propertyType = classed > 0 ? 1 : 3;
      evidence.push({
        kind: 'historical_purchase',
        text: `No ${ASSET_CLASS_LABEL[assetClass!].toLowerCase()} purchases on record`,
      });
    }
  } else if (types.length > 0 && type) {
    if (types.includes(type)) {
      evidence.push({
        kind: 'stated_preference',
        text: `Buys ${deal.propertyType}`,
      });
    } else {
      propertyType = 0;
      mismatches.push(`property type ${deal.propertyType} not in ${types.join(', ')}`);
    }
  }

  // ----------------------------------------------------------- condition
  // For a house: repairs and ARV. For land and commercial: size and yield.
  let condition = 5;
  if (nonResidential) {
    condition = sizeFit(deal, buyer, relevant, evidence, mismatches);
  } else if (
    buyer.buyBox.maxRepairs != null &&
    deal.repairEstimate != null &&
    deal.repairEstimate > buyer.buyBox.maxRepairs
  ) {
    condition = 0;
    mismatches.push(
      `repairs ${money(deal.repairEstimate)} above their limit ${money(buyer.buyBox.maxRepairs)}`,
    );
  }
  if (
    buyer.buyBox.minArv != null &&
    deal.arv != null &&
    deal.arv < buyer.buyBox.minArv
  ) {
    condition = 0;
    mismatches.push(
      `ARV ${money(deal.arv)} below their minimum ${money(buyer.buyBox.minArv)}`,
    );
  }

  if (
    nonResidential &&
    deal.capRate != null &&
    buyer.buyBox.minCapRate != null &&
    deal.capRate < buyer.buyBox.minCapRate
  ) {
    condition = 0;
    mismatches.push(
      `cap rate ${(deal.capRate * 100).toFixed(1)}% below their ${(buyer.buyBox.minCapRate * 100).toFixed(1)}% minimum`,
    );
  }

  // ------------------------------------------------------------- funding
  let funding = 0;
  const pofLive =
    !buyer.pof.expiresAt || buyer.pof.expiresAt.getTime() > now.getTime();
  if (buyer.pof.status === 'verified' && pofLive) {
    const covers =
      buyer.pof.amount != null && price != null && buyer.pof.amount >= price;
    funding = covers ? 15 : 8;
    evidence.push({
      kind: 'verified_pof',
      text:
        buyer.pof.amount != null
          ? `Proof of funds verified for ${money(buyer.pof.amount)}${covers ? '' : price != null ? ' (less than this price)' : ''}`
          : 'Proof of funds verified (amount not recorded)',
    });
  } else if (buyer.pof.status === 'verified') {
    funding = 3;
    evidence.push({
      kind: 'unverified_pof',
      text: 'Proof of funds was verified but has expired',
    });
  } else if (buyer.pof.status === 'received') {
    funding = 5;
    evidence.push({
      kind: 'unverified_pof',
      text: 'Proof of funds received, not yet verified',
    });
  }

  // ---------------------------------------------------------- engagement
  let engagement = 0;
  if (buyer.engagement.replies > 0) engagement += 3;
  if (buyer.engagement.interested > 0) {
    engagement += 2;
    evidence.push({
      kind: 'expressed_interest',
      text: `Expressed interest in ${buyer.engagement.interested} of our deal(s)`,
    });
  }
  if (buyer.outcomes.offers > 0) {
    evidence.push({
      kind: 'offer',
      text: `Made ${buyer.outcomes.offers} offer(s) on our deals`,
    });
  }

  // --------------------------------------------------------- reliability
  // A Beta(1,1) prior on "closes once accepted": no history is neutral,
  // a buyer who walked away loses points, one who closed gains a few.
  const settled = buyer.outcomes.closed + buyer.outcomes.fellThrough;
  const rate = (buyer.outcomes.closed + 1) / (settled + 2);
  const reliability = Math.max(-10, Math.min(5, Math.round((rate - 0.5) * 20)));
  if (buyer.outcomes.closed > 0) {
    evidence.push({
      kind: 'closing',
      text: `Closed ${buyer.outcomes.closed} assignment(s) with us`,
    });
  }
  if (buyer.outcomes.fellThrough > 0) {
    mismatches.push(
      `walked away from ${buyer.outcomes.fellThrough} accepted deal(s)`,
    );
  }

  // --------------------------------------------------- contactability
  const channels: Array<'email' | 'sms'> = [];
  if (buyer.hasEmail && buyer.emailConsent) channels.push('email');
  if (buyer.hasPhone && buyer.smsConsent) channels.push('sms');
  if (buyer.status !== 'active') {
    excludedReasons.push(
      buyer.status === 'do_not_market'
        ? 'marked do not market'
        : 'buyer is inactive',
    );
  }
  if (buyer.optedOut) excludedReasons.push('opted out (do-not-contact list)');
  if (!buyer.hasEmail && !buyer.hasPhone) {
    excludedReasons.push('no email or phone on file');
  } else if (channels.length === 0) {
    excludedReasons.push(
      'no consent on file for any channel we hold a contact for',
    );
  }

  const components = {
    location,
    price: priceScore,
    propertyType,
    condition,
    trackRecord,
    funding,
    engagement,
    reliability,
  };
  const raw = Object.values(components).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return {
    buyerId: buyer.id,
    name: buyer.name,
    score,
    contactable: excludedReasons.length === 0,
    excludedReasons,
    mismatches,
    components,
    evidence,
    historicalRange,
    inferredCapacity,
    channels,
  };
}

/**
 * Every buyer ranked for the deal: contactable buyers first, then by score,
 * then by name so ties are stable.
 */
export function rankBuyersForDeal(
  deal: RankingDeal,
  buyers: RankingBuyer[],
  now: Date,
): BuyerMatch[] {
  return buyers
    .map((b) => matchBuyerToDeal(deal, b, now))
    .sort((a, b) => {
      if (a.contactable !== b.contactable) return a.contactable ? -1 : 1;
      if (b.score !== a.score) return b.score - a.score;
      return a.name.localeCompare(b.name);
    });
}

/** A short sentence for the buyer list: the strongest reasons first. */
export function matchExplanation(m: BuyerMatch): string {
  if (!m.contactable) return `Cannot be offered this deal: ${m.excludedReasons.join('; ')}.`;
  const order: MatchEvidenceKind[] = [
    'offer',
    'closing',
    'expressed_interest',
    'verified_pof',
    'historical_purchase',
    'stated_preference',
    'unverified_pof',
    'inferred_capacity',
  ];
  const parts = [...m.evidence]
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))
    .slice(0, 3)
    .map((e) => e.text);
  const tail = m.mismatches.length ? ` Watch: ${m.mismatches.join('; ')}.` : '';
  return (parts.length ? `${parts.join('. ')}.` : 'No specific evidence of fit.') + tail;
}

/**
 * Land and commercial size fit (0-5): the stated acreage, area or unit
 * range when there is one, else the range of what they bought.
 */
function sizeFit(
  deal: RankingDeal,
  buyer: RankingBuyer,
  relevant: RankingTransaction[],
  evidence: MatchEvidence[],
  mismatches: string[],
): number {
  const land = deal.assetClass === 'land';
  const value = land ? deal.acres : deal.buildingSqft;
  const unit = land ? 'acres' : 'sq ft';
  const lo = land ? buyer.buyBox.acresMin : buyer.buyBox.sqftMin;
  const hi = land ? buyer.buyBox.acresMax : buyer.buyBox.sqftMax;
  if (value == null || !(value > 0)) return 3;
  if (lo != null || hi != null) {
    if ((lo == null || value >= lo) && (hi == null || value <= hi)) {
      evidence.push({ kind: 'stated_preference', text: `${fmt(value)} ${unit} is in their stated range` });
      return 5;
    }
    mismatches.push(`${fmt(value)} ${unit} outside their stated ${fmt(lo ?? 0)}-${hi != null ? fmt(hi) : 'any'} ${unit}`);
    return 0;
  }
  if (!land && deal.units != null && (buyer.buyBox.unitsMin != null || buyer.buyBox.unitsMax != null)) {
    const ok =
      (buyer.buyBox.unitsMin == null || deal.units >= buyer.buyBox.unitsMin) &&
      (buyer.buyBox.unitsMax == null || deal.units <= buyer.buyBox.unitsMax);
    if (!ok) mismatches.push(`${deal.units} units outside their stated range`);
    return ok ? 5 : 0;
  }
  const sizes = relevant
    .map((t) => (land ? t.acres : t.buildingSqft))
    .filter((v): v is number => typeof v === 'number' && v > 0);
  if (!sizes.length) return 3;
  const min = Math.min(...sizes);
  const max = Math.max(...sizes);
  if (value >= min * 0.5 && value <= max * 2) {
    evidence.push({
      kind: 'historical_purchase',
      text: `Bought ${fmt(min)}-${fmt(max)} ${unit} before`,
    });
    return 4;
  }
  return 1;
}

function fmt(n: number): string {
  return n >= 100 ? Math.round(n).toLocaleString('en-US') : String(Math.round(n * 10) / 10);
}

/** The buy box from a buyer's stored `preferences` JSON, tolerant of the legacy shape. */
export function buyBoxFromPreferences(prefs: unknown): BuyBox {
  const p = (prefs && typeof prefs === 'object' ? prefs : {}) as Record<
    string,
    unknown
  >;
  const strings = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.map((x) => String(x ?? '').trim()).filter(Boolean)
      : [];
  const num = (v: unknown): number | null => {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const range = (p.priceRange ?? {}) as Record<string, unknown>;
  const acres = (p.acreage ?? {}) as Record<string, unknown>;
  const sqft = (p.buildingSqft ?? {}) as Record<string, unknown>;
  const units = (p.units ?? {}) as Record<string, unknown>;
  const capRate = num(p.minCapRate);
  return {
    locations: strings(p.locations),
    propertyTypes: strings(p.propertyTypes),
    priceMin: num(range.min),
    priceMax: num(range.max),
    maxRepairs: num(p.maxRepairEstimate),
    minArv: num(p.minARV),
    assetClasses: strings(p.assetClasses).filter(isAssetClass),
    assetSubtypes: strings(p.assetSubtypes),
    counties: strings(p.counties),
    acresMin: num(acres.min),
    acresMax: num(acres.max),
    sqftMin: num(sqft.min),
    sqftMax: num(sqft.max),
    unitsMin: num(units.min),
    unitsMax: num(units.max),
    zoning: strings(p.zoning),
    // Stored as a percentage (7.5) or a fraction (0.075).
    minCapRate: capRate == null ? null : capRate > 1 ? capRate / 100 : capRate,
  };
}
