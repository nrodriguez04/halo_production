import { toJurisdictionCode } from '../markets/jurisdictions';
import { partyKind, type PartyKind } from './entities';

/**
 * Provider-neutral records (docs/data-pipeline.md). Every provider's data
 * is turned into these shapes before Halo stores it, so nothing downstream
 * depends on one vendor. Each record says where it came from and how much
 * to trust it: `recorded` is a public record (a deed, an assessor roll),
 * `reported` a provider's compilation, `estimated` a model's output.
 */

export type DataQuality = 'recorded' | 'reported' | 'estimated';

export interface NormalizedProperty {
  source: string;
  sourceRef: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
  /** Five-digit county FIPS. */
  countyFips: string | null;
  apn: string | null;
  latitude: number | null;
  longitude: number | null;
  propertyType: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  lotSqft: number | null;
  yearBuilt: number | null;
  assessedValue: number | null;
  /** A provider's or assessor's market value: an estimate, never a sale. */
  marketValue: number | null;
  lastSaleDate: string | null;
  lastSalePrice: number | null;
  ownerName: string | null;
  ownerKind: PartyKind | null;
  absentee: boolean | null;
  quality: DataQuality;
}

export interface NormalizedSale {
  source: string;
  /** The provider's id for the transaction, or the recording reference. */
  sourceRef: string;
  state: string;
  county: string | null;
  countyFips: string | null;
  city: string | null;
  zip: string | null;
  address: string | null;
  apn: string | null;
  /** YYYY-MM-DD */
  saleDate: string;
  price: number | null;
  buyerName: string | null;
  buyerKind: PartyKind | null;
  buyerMailingZip: string | null;
  sellerName: string | null;
  sellerKind: PartyKind | null;
  /** True when no purchase mortgage was recorded; null when unknown. */
  cashPurchase: boolean | null;
  armsLength: boolean | null;
  deedType: string | null;
  propertyType: string | null;
  quality: DataQuality;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
};
const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n != null && n > 0 ? n : null;
};

/** YYYY-MM-DD from the date shapes providers and counties use, or null. */
export function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

/**
 * An ATTOM property profile (expandedprofile / detail). Field paths follow
 * ATTOM's Property API response; anything absent stays null.
 */
export function propertyFromAttom(raw: unknown): NormalizedProperty | null {
  const p = obj(arr(obj(raw).property)[0] ?? raw);
  const address = obj(p.address);
  const id = obj(p.identifier);
  const area = obj(p.area);
  const location = obj(p.location);
  const summary = obj(p.summary);
  const building = obj(p.building);
  const rooms = obj(building.rooms);
  const size = obj(building.size);
  const lot = obj(p.lot);
  const assessment = obj(p.assessment);
  const sale = obj(p.sale);
  const owner = obj(p.owner);
  const ownerName = str(obj(owner.owner1).fullname) ?? str(obj(owner.owner1).lastname) ?? str(owner.name);
  const absentee = str(summary.absenteeInd) ?? str(owner.absenteeownerstatus);
  const state = toJurisdictionCode(str(address.countrySubd) ?? str(address.state));
  if (!str(address.line1) && !str(address.oneLine)) return null;
  return {
    source: 'attom',
    sourceRef: str(id.attomId) ?? str(id.Id) ?? str(id.obPropId),
    address: str(address.line1) ?? str(address.oneLine),
    city: str(address.locality) ?? str(address.city),
    state,
    zip: str(address.postal1) ?? str(address.zip),
    county: str(area.countrysecsubd) ?? str(area.munname),
    countyFips: str(id.fips) && /^\d{5}$/.test(String(id.fips)) ? String(id.fips) : null,
    apn: str(id.apn),
    latitude: num(location.latitude),
    longitude: num(location.longitude),
    propertyType: str(summary.proptype) ?? str(summary.propclass) ?? str(summary.propLandUse),
    beds: pos(rooms.beds),
    baths: pos(rooms.bathstotal),
    sqft: pos(size.livingsize) ?? pos(size.universalsize),
    lotSqft: pos(lot.lotsize2) ?? (pos(lot.lotSize1) != null ? Math.round(pos(lot.lotSize1)! * 43_560) : null),
    yearBuilt: pos(summary.yearbuilt),
    assessedValue: pos(obj(assessment.assessed).assdttlvalue),
    marketValue: pos(obj(assessment.market).mktttlvalue),
    lastSaleDate: isoDate(sale.saleTransDate) ?? isoDate(obj(sale.amount).salerecdate),
    lastSalePrice: pos(obj(sale.amount).saleamt),
    ownerName,
    ownerKind: ownerName ? partyKind(ownerName) : null,
    absentee: absentee ? !/owner\s*occupied/i.test(absentee) : null,
    quality: 'reported',
  };
}

/**
 * A Regrid parcel (GeoJSON feature). Regrid standardizes county assessor
 * fields under `properties.fields`.
 */
export function propertyFromRegrid(raw: unknown): NormalizedProperty | null {
  const feature = obj(arr(obj(obj(raw).parcels).features)[0] ?? raw);
  const f = obj(obj(feature.properties).fields);
  const address = str(f.address) ?? str(f.saddress);
  if (!address) return null;
  const state = toJurisdictionCode(str(f.state2) ?? str(f.sstate));
  return {
    source: 'regrid',
    sourceRef: str(f.ll_uuid) ?? str(obj(feature.properties).ll_uuid),
    address,
    city: str(f.scity) ?? str(f.city),
    state,
    zip: str(f.szip5) ?? str(f.szip),
    county: str(f.county),
    countyFips: str(f.geoid) && /^\d{5}$/.test(String(f.geoid)) ? String(f.geoid) : null,
    apn: str(f.parcelnumb),
    latitude: num(f.lat),
    longitude: num(f.lon),
    propertyType: str(f.usedesc) ?? str(f.usecode),
    beds: null,
    baths: null,
    sqft: pos(f.area_building),
    lotSqft: pos(f.ll_gissqft) ?? pos(f.sqft),
    yearBuilt: pos(f.yearbuilt),
    assessedValue: pos(f.parval),
    marketValue: null,
    lastSaleDate: isoDate(f.saledate),
    lastSalePrice: pos(f.saleprice),
    ownerName: str(f.owner),
    ownerKind: str(f.owner) ? partyKind(str(f.owner)) : null,
    absentee: str(f.mailadd) && address ? normalizeStreet(String(f.mailadd)) !== normalizeStreet(address) : null,
    quality: 'recorded',
  };
}

function normalizeStreet(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * A county recorded-sales export, through a column mapping the operator
 * confirms when importing (counties name columns differently). Returns
 * null for a row that is not a usable sale.
 */
export function saleFromCountyRow(
  row: Record<string, string>,
  map: Partial<Record<keyof NormalizedSale | 'mortgageAmount' | 'state', string>>,
  defaults: { source: string; state: string; county?: string | null; countyFips?: string | null },
): NormalizedSale | null {
  const get = (k: string) => (map[k as keyof typeof map] ? str(row[map[k as keyof typeof map] as string]) : null);
  const saleDate = isoDate(get('saleDate'));
  const ref = get('sourceRef');
  const state = toJurisdictionCode(get('state') ?? defaults.state);
  if (!saleDate || !ref || !state) return null;
  const buyerName = get('buyerName');
  const sellerName = get('sellerName');
  const mortgage = num(get('mortgageAmount'));
  const cashRaw = get('cashPurchase');
  const cash =
    cashRaw != null
      ? /^(y|yes|true|1|cash)$/i.test(cashRaw)
      : map.mortgageAmount
        ? !(mortgage != null && mortgage > 0)
        : null;
  const armsRaw = get('armsLength');
  return {
    source: defaults.source,
    sourceRef: ref,
    state,
    county: get('county') ?? defaults.county ?? null,
    countyFips: get('countyFips') ?? defaults.countyFips ?? null,
    city: get('city'),
    zip: get('zip')?.slice(0, 5) ?? null,
    address: get('address'),
    apn: get('apn'),
    saleDate,
    price: pos(get('price')),
    buyerName,
    buyerKind: buyerName ? partyKind(buyerName) : null,
    buyerMailingZip: get('buyerMailingZip')?.slice(0, 5) ?? null,
    sellerName,
    sellerKind: sellerName ? partyKind(sellerName) : null,
    cashPurchase: cash,
    armsLength: armsRaw != null ? /^(y|yes|true|1)$/i.test(armsRaw) : null,
    deedType: get('deedType'),
    propertyType: get('propertyType'),
    quality: 'recorded',
  };
}

/**
 * Sales from an ATTOM sales-history response. ATTOM reports buyer and
 * seller names and the mortgage on the sale where the county records them.
 */
export function salesFromAttomHistory(raw: unknown): NormalizedSale[] {
  const out: NormalizedSale[] = [];
  for (const prop of arr(obj(raw).property)) {
    const p = obj(prop);
    const address = obj(p.address);
    const id = obj(p.identifier);
    const area = obj(p.area);
    const state = toJurisdictionCode(str(address.countrySubd));
    if (!state) continue;
    for (const s of arr(p.salehistory).length ? arr(p.salehistory) : [p.sale]) {
      const sale = obj(s);
      const amount = obj(sale.amount);
      const date = isoDate(sale.saleTransDate) ?? isoDate(amount.salerecdate);
      if (!date) continue;
      const buyer = str(obj(sale.buyer).name) ?? str(obj(obj(sale.buyer).buyer1).fullname) ?? str(sale.buyerName);
      const seller = str(obj(sale.seller).name) ?? str(obj(obj(sale.seller).seller1).fullname) ?? str(sale.sellerName);
      const mortgage = pos(obj(obj(sale.mortgage).amount).amount) ?? pos(obj(sale.mortgage).amount);
      const mortgageKnown = sale.mortgage !== undefined;
      out.push({
        source: 'attom',
        sourceRef: `${str(id.attomId) ?? str(id.Id) ?? str(address.oneLine)}:${date}`,
        state,
        county: str(area.countrysecsubd),
        countyFips: str(id.fips) && /^\d{5}$/.test(String(id.fips)) ? String(id.fips) : null,
        city: str(address.locality),
        zip: str(address.postal1),
        address: str(address.line1),
        apn: str(id.apn),
        saleDate: date,
        price: pos(amount.saleamt),
        buyerName: buyer,
        buyerKind: buyer ? partyKind(buyer) : null,
        buyerMailingZip: null,
        sellerName: seller,
        sellerKind: seller ? partyKind(seller) : null,
        cashPurchase: mortgageKnown ? !mortgage : null,
        armsLength: str(amount.saledisclosuretype) ? !/non.?arms/i.test(String(amount.saledisclosuretype)) : null,
        deedType: str(amount.saletranstype) ?? str(sale.deedType),
        propertyType: str(obj(p.summary).proptype),
        quality: 'recorded',
      });
    }
  }
  return out;
}
