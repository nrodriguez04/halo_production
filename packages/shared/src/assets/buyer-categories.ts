import type { AssetClass, AssetSubtype } from './taxonomy';

/**
 * Buyer categories for land and commercial deals (docs/asset-classes.md
 * s6). Every category Halo assigns from the public record is an inference
 * and says so: a company that bought three lots looks like a land
 * investor, and that is all it is until the buyer confirms it. A person
 * records a confirmed category on the buyer.
 */

export const BUYER_CATEGORIES = [
  'local_land_investor',
  'land_developer',
  'homebuilder',
  'agricultural_investor',
  'recreational_buyer',
  'land_investment_company',
  'commercial_investor',
  'multifamily_investor',
  'private_investment_company',
  'commercial_developer',
  'owner_operator',
  'acquisition_firm',
  'residential_investor',
] as const;
export type BuyerCategory = (typeof BUYER_CATEGORIES)[number];

export const BUYER_CATEGORY_LABEL: Record<BuyerCategory, string> = {
  local_land_investor: 'Local land investor',
  land_developer: 'Land developer',
  homebuilder: 'Builder or homebuilder',
  agricultural_investor: 'Agricultural investor',
  recreational_buyer: 'Recreational land buyer',
  land_investment_company: 'Land investment company',
  commercial_investor: 'Commercial real estate investor',
  multifamily_investor: 'Multifamily investor',
  private_investment_company: 'Private investment company',
  commercial_developer: 'Developer',
  owner_operator: 'Owner-operator',
  acquisition_firm: 'Commercial acquisition firm',
  residential_investor: 'Residential investor',
};

export interface CategorizedPurchase {
  assetClass: AssetClass | null;
  subtype: AssetSubtype | null;
  state: string;
  county: string | null;
  acres?: number | null;
}

export interface InferredCategory {
  category: BuyerCategory;
  basis: 'inferred';
  reasons: string[];
}

const NAME_RULES: Array<{ re: RegExp; category: BuyerCategory; why: string }> = [
  { re: /\b(HOMES|HOMEBUILD|BUILDERS?|CONSTRUCTION|CUSTOM HOMES)\b/, category: 'homebuilder', why: 'name suggests a builder' },
  { re: /\b(DEVELOPMENT|DEVELOPERS?|DEV CO)\b/, category: 'land_developer', why: 'name suggests a developer' },
  { re: /\b(FARMS?|AG|CATTLE|AGRI\w*|RANCH(ES)?|ORCHARDS?)\b/, category: 'agricultural_investor', why: 'name suggests agriculture' },
  { re: /\b(HUNTING|OUTDOORS?|RECREATION\w*|TIMBERLANDS?)\b/, category: 'recreational_buyer', why: 'name suggests recreational land' },
  { re: /\b(LAND|ACRES?|ACREAGE)\b/, category: 'land_investment_company', why: 'name suggests a land company' },
  { re: /\b(APARTMENTS?|MULTIFAMILY|RESIDENTIAL PARTNERS|COMMUNITIES)\b/, category: 'multifamily_investor', why: 'name suggests multifamily' },
  { re: /\b(ACQUISITIONS?|REIT|REALTY TRUST|PROPERTY FUND|FUND [IVX0-9]+)\b/, category: 'acquisition_firm', why: 'name suggests an acquisition vehicle' },
  { re: /\b(CAPITAL|PARTNERS|EQUITY|INVESTMENTS?|HOLDINGS|VENTURES)\b/, category: 'private_investment_company', why: 'name suggests an investment company' },
];

const share = (n: number, d: number) => (d > 0 ? n / d : 0);

/**
 * Categories a buyer's record suggests: from what they bought (the mix of
 * asset classes and subtypes, how concentrated geographically) and, as
 * weaker evidence, their name. Purchases without a class count for
 * nothing either way.
 */
export function inferBuyerCategories(input: {
  name: string;
  kind: string;
  purchases: readonly CategorizedPurchase[];
}): InferredCategory[] {
  const out = new Map<BuyerCategory, string[]>();
  const add = (c: BuyerCategory, why: string) => out.set(c, [...(out.get(c) ?? []), why]);
  const classed = input.purchases.filter((p) => p.assetClass);
  const n = classed.length;
  const land = classed.filter((p) => p.assetClass === 'land');
  const commercial = classed.filter((p) => p.assetClass === 'commercial');
  const residential = classed.filter((p) => p.assetClass === 'residential');
  const name = input.name.toUpperCase();
  const company = input.kind === 'company' || input.kind === 'trust';

  if (land.length >= 2 && share(land.length, n) >= 0.5) {
    const counties = new Set(land.map((p) => `${p.state}:${p.county ?? ''}`));
    const ag = land.filter((p) => p.subtype === 'agricultural').length;
    const rec = land.filter((p) => p.subtype === 'recreational').length;
    const lots = land.filter((p) => p.subtype === 'residential_lot' || p.subtype === 'infill_lot').length;
    const commercialLand = land.filter((p) => p.subtype === 'commercial_land').length;
    if (counties.size <= 2) add('local_land_investor', `${land.length} land purchases in ${counties.size} count${counties.size === 1 ? 'y' : 'ies'}`);
    else add('land_investment_company', `${land.length} land purchases across ${counties.size} counties`);
    if (ag >= 2) add('agricultural_investor', `${ag} agricultural parcels`);
    if (rec >= 2) add('recreational_buyer', `${rec} recreational parcels`);
    if (lots >= 3) add('homebuilder', `${lots} residential lots`);
    if (commercialLand >= 2) add('land_developer', `${commercialLand} commercial land parcels`);
  }
  if (commercial.length >= 1 && share(commercial.length, n) >= 0.5) {
    const mf = commercial.filter((p) => p.subtype === 'multifamily').length;
    if (mf >= 1 && share(mf, commercial.length) >= 0.5) add('multifamily_investor', `${mf} multifamily purchase${mf === 1 ? '' : 's'}`);
    if (commercial.length >= 2) add('commercial_investor', `${commercial.length} commercial purchases`);
  }
  if (residential.length >= 2 && share(residential.length, n) >= 0.5) {
    add('residential_investor', `${residential.length} residential purchases`);
  }
  if (company) {
    for (const rule of NAME_RULES) {
      if (rule.re.test(name)) {
        // A name alone suggests a category only where purchases do not contradict it.
        const contradicts =
          (['homebuilder', 'land_developer', 'agricultural_investor', 'recreational_buyer', 'land_investment_company'].includes(rule.category) && n >= 3 && land.length === 0) ||
          (['multifamily_investor', 'acquisition_firm'].includes(rule.category) && n >= 3 && commercial.length === 0);
        if (!contradicts) add(rule.category, rule.why);
      }
    }
  }
  return Array.from(out.entries()).map(([category, reasons]) => ({ category, basis: 'inferred' as const, reasons }));
}
