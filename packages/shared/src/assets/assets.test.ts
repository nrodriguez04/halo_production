import { discoverInvestors } from '../data/investors';
import type { NormalizedSale } from '../data/records';
import { propertyFromAttom, propertyFromRegrid } from '../data/records';
import { matchBuyerToDeal, type RankingBuyer } from '../disposition/buyer-ranking';
import { inferBuyerCategories } from './buyer-categories';
import { classifyProperty } from './classify';
import { resolveNoi, underwriteCommercial, type CommercialUnderwritingInput } from './commercial-underwriting';
import { diligenceStatus } from './diligence';
import { criticalUnknowns, factChecklist, type FactRecord } from './facts';
import { underwriteLand, type LandUnderwritingInput } from './land-underwriting';
import { isIdentifiable, parcelKey, propertyLabel } from './parcel';
import { underwriteResidential } from './residential-underwriting';
import { matchesCriteria, type ParcelCandidate } from './sourcing';
import { buyerDemandFrom } from './underwriting-types';

// Every record here is SYNTHETIC: invented parcels, sales and buyers.
const NOW = new Date('2026-11-01T12:00:00Z');
const noDemand = buyerDemandFrom(null);

describe('classifyProperty', () => {
  it('reads standardized provider labels together with the building facts', () => {
    expect(classifyProperty({ labels: ['SFR'], buildingSqft: 1800, yearBuilt: 1998 })).toMatchObject({
      assetClass: 'residential',
      subtype: 'single_family',
      confidence: 'high',
    });
    expect(classifyProperty({ labels: ['DUPLEX'], units: 2, buildingSqft: 2000 }).subtype).toBe('small_multifamily');
    expect(classifyProperty({ labels: ['WAREHOUSE'], buildingSqft: 24000 })).toMatchObject({ assetClass: 'commercial', subtype: 'industrial' });
    expect(classifyProperty({ labels: ['VACANT LAND (NEC)'], improvementValue: 0, acres: 12 })).toMatchObject({
      assetClass: 'land',
      subtype: 'rural_acreage',
      confidence: 'high',
    });
  });

  it('makes five or more units commercial multifamily whatever the label says', () => {
    expect(classifyProperty({ labels: ['MULTI-FAMILY'], units: 12, buildingSqft: 9000 })).toMatchObject({
      assetClass: 'commercial',
      subtype: 'multifamily',
    });
  });

  it('tells commercial land from a commercial building by whether a building stands on it', () => {
    expect(classifyProperty({ labels: ['COMMERCIAL'], improvementValue: 0, acres: 2.4 })).toMatchObject({
      assetClass: 'land',
      subtype: 'commercial_land',
    });
    expect(classifyProperty({ labels: ['VACANT'], zoning: 'C-2', hasStructure: false, acres: 1.2 })).toMatchObject({
      assetClass: 'land',
      subtype: 'commercial_land',
    });
    expect(classifyProperty({ labels: ['RETAIL'], buildingSqft: 6000, zoning: 'C-2' })).toMatchObject({
      assetClass: 'commercial',
      subtype: 'retail',
    });
  });

  it('leaves unknown or conflicting records unclassified instead of calling them residential', () => {
    const code = classifyProperty({ labels: ['1110'] });
    expect(code.assetClass).toBeNull();
    expect(code.unresolved).toMatch(/Nothing on the record/);
    const conflict = classifyProperty({ labels: ['VACANT LAND'], buildingSqft: 2400 });
    expect(conflict.assetClass).toBeNull();
    expect(conflict.suggestion).toEqual({ assetClass: 'land', subtype: null });
    const bare = classifyProperty({ labels: ['COMMERCIAL'] });
    expect(bare.assetClass).toBeNull();
    expect(bare.suggestion?.assetClass).toBe('commercial');
    expect(classifyProperty({}).assetClass).toBeNull();
  });

  it('never assigns the subtypes that are a judgement about the future', () => {
    const c = classifyProperty({ labels: ['VACANT RESIDENTIAL'], improvementValue: 0, acres: 22, zoning: 'R-1' });
    expect(c.assetClass).toBe('land');
    expect(['development_parcel', 'subdividable', 'infill_lot']).not.toContain(c.subtype);
    expect(c.developmentIndicators.length).toBeGreaterThan(0);
  });
});

describe('parcels without a street address', () => {
  it('normalizes the parcel key across spellings of the county and APN', () => {
    expect(parcelKey('tx', 'Bastrop County', '12-3456-00')).toBe('TX|bastrop|12345600');
    expect(parcelKey('TX', 'bastrop', '123456 00')).toBe('TX|bastrop|12345600');
    expect(parcelKey('TX', null, '1234')).toBeNull();
  });

  it('names and identifies a parcel by APN and county', () => {
    const p = { address: null, state: 'TX', county: 'Bastrop', apn: 'R12345' };
    expect(propertyLabel(p)).toBe('Parcel R12345, Bastrop County, TX');
    expect(isIdentifiable(p)).toBe(true);
    expect(isIdentifiable({ state: 'TX' })).toBe(false);
  });

  it('keeps an ATTOM or Regrid parcel that has an APN and county but no address', () => {
    const attom = propertyFromAttom({
      property: [
        {
          identifier: { attomId: 'SYN-1', apn: 'R12345', fips: '48021' },
          address: { countrySubd: 'TX' },
          area: { countrysecsubd: 'Bastrop' },
          summary: { propLandUse: 'VACANT LAND (NEC)' },
          lot: { lotSize1: 14.2 },
          assessment: { market: { mktimprvalue: 0 } },
        },
      ],
    });
    expect(attom).toMatchObject({ address: null, apn: 'R12345', acres: 14.2, improvementValue: 0, landUse: 'VACANT LAND (NEC)' });
    const regrid = propertyFromRegrid({
      properties: { fields: { parcelnumb: 'R999', county: 'Bastrop', state2: 'TX', ll_gisacre: 30, zoning: 'AG', struct: 'N', usedesc: 'Agricultural' } },
    });
    expect(regrid).toMatchObject({ address: null, apn: 'R999', acres: 30, zoning: 'AG', hasStructure: false });
  });
});

const landComps = (county = 'Bastrop') =>
  [
    { ref: 'syn-1', saleDate: '2026-03-01', price: 120_000, acres: 10, county, zip: '78602' },
    { ref: 'syn-2', saleDate: '2026-01-15', price: 150_000, acres: 12, county, zip: '78602' },
    { ref: 'syn-3', saleDate: '2025-11-10', price: 98_000, acres: 9, county, zip: '78612' },
    { ref: 'syn-4', saleDate: '2025-08-01', price: 210_000, acres: 18, county, zip: '78602' },
    { ref: 'syn-5', saleDate: '2025-05-20', price: 135_000, acres: 11, county, zip: '78602' },
    // Excluded: another county, too old, far too large.
    { ref: 'syn-6', saleDate: '2026-02-01', price: 500_000, acres: 10, county: 'Travis', zip: '78701' },
    { ref: 'syn-7', saleDate: '2021-01-01', price: 40_000, acres: 10, county, zip: '78602' },
    { ref: 'syn-8', saleDate: '2026-02-01', price: 900_000, acres: 300, county, zip: '78602' },
  ];

function landInput(over: Partial<LandUnderwritingInput> = {}): LandUnderwritingInput {
  const facts: FactRecord[] = [
    { key: 'gross_acres', value: 12, status: 'reported', source: 'realie' },
    { key: 'legal_access', value: true, status: 'verified', source: 'title company', documentId: 'doc-1' },
    { key: 'zoning', value: 'AG', status: 'verified', source: 'Bastrop County' },
    { key: 'flood_zone', value: 'X', status: 'verified', source: 'FEMA NFHL' },
  ];
  return {
    subject: { acres: 12, subtype: 'rural_acreage', county: 'Bastrop', zip: '78602', zoning: 'AG' },
    facts,
    comps: landComps(),
    asOf: NOW,
    targetFee: 10_000,
    transactionCosts: 2_000,
    diligenceCosts: 1_500,
    minNetProfit: 5_000,
    buyerDemand: noDemand,
    ...over,
  };
}

describe('land underwriting', () => {
  it('values land from comparable sales per acre, not the residential ARV formula', () => {
    const u = underwriteLand(landInput());
    expect(u.strategy).toBe('land_comparables');
    expect(u.approaches[0].evidenceCount).toBe(5);
    // 5 comps at ~$10.9k-$12.5k/acre; the excluded sales would have moved it.
    expect(u.approaches[0].unitValue!.mid).toBeGreaterThan(11_000);
    expect(u.approaches[0].unitValue!.mid).toBeLessThan(12_600);
    expect(u.valuation!.low).toBeLessThan(u.valuation!.high);
    // No ARV, no 70% rule: the offer works back from what a land buyer pays.
    expect(u.explanation.join(' ')).not.toMatch(/ARV|70%/);
    expect(u.offerRange!.high).toBe(Math.round((u.expectedBuyerPrice! - 10_000 - 3_500) / 500) * 500);
    expect(u.assumptions.join(' ')).toMatch(/75% of the low end/);
    expect(u.decision).toBe('pursue');
    // Valuations are not shown to the dollar.
    expect(u.valuation!.mid % 1_000).toBe(0);
  });

  it('reads a missing fact as a risk, never as good news', () => {
    const facts: FactRecord[] = [{ key: 'gross_acres', value: 12, status: 'reported', source: 'realie' }];
    const u = underwriteLand(landInput({ facts }));
    expect(u.decision).toBe('review');
    expect(u.missing.join(' ')).toMatch(/Legal access is not established/);
    expect(u.missing.join(' ')).toMatch(/A nearby line is not service/);
    expect(u.confidence.score).toBeLessThan(underwriteLand(landInput()).confidence.score);
  });

  it('refuses to value a parcel with too few comparables or no acreage', () => {
    const thin = underwriteLand(landInput({ comps: landComps().slice(0, 2) }));
    expect(thin.decision).toBe('review');
    expect(thin.missing.join(' ')).toMatch(/Only 2 comparable/);
    const noAcres = underwriteLand(landInput({ subject: { acres: null, subtype: null, county: 'Bastrop', zip: null, zoning: null } }));
    expect(noAcres.valuation).toBeNull();
    expect(noAcres.offerRange).toBeNull();
    expect(noAcres.missing[0]).toMatch(/Acreage is not on file/);
  });

  it('passes on a landlocked parcel and uses buyers\' own price per acre when known', () => {
    const facts: FactRecord[] = [{ key: 'legal_access', value: false, status: 'verified', source: 'title company' }];
    expect(underwriteLand(landInput({ facts })).decision).toBe('pass');
    const withBuyers = underwriteLand(landInput({ buyerPricePerAcre: 8_000 }));
    expect(withBuyers.expectedBuyerPrice).toBe(96_000);
    expect(withBuyers.evidence.some((e) => e.kind === 'buyer_demand')).toBe(true);
  });
});

function commercialInput(facts: FactRecord[], over: Partial<CommercialUnderwritingInput> = {}): CommercialUnderwritingInput {
  return {
    subject: { subtype: 'retail', county: 'Travis', buildingSqft: 10_000, units: null },
    facts,
    comps: [
      { ref: 'c1', saleDate: '2026-02-01', price: 2_100_000, subtype: 'retail', buildingSqft: 10_500, units: null, county: 'Travis' },
      { ref: 'c2', saleDate: '2025-10-01', price: 1_800_000, subtype: 'retail', buildingSqft: 9_000, units: null, county: 'Travis' },
      { ref: 'c3', saleDate: '2025-06-01', price: 2_600_000, subtype: 'retail', buildingSqft: 12_000, units: null, county: 'Travis' },
      { ref: 'c4', saleDate: '2025-06-01', price: 9_000_000, subtype: 'office', buildingSqft: 30_000, units: null, county: 'Travis' },
    ],
    asOf: NOW,
    targetFee: 25_000,
    transactionCosts: 5_000,
    minNetProfit: 10_000,
    buyerDemand: noDemand,
    ...over,
  };
}

describe('commercial underwriting', () => {
  const verified: FactRecord[] = [
    { key: 'noi', value: 160_000, status: 'verified', source: 'T12 checked', documentId: 'doc-t12' },
    { key: 'occupancy_rate', value: 94, status: 'verified', source: 'rent roll', documentId: 'doc-rr' },
    { key: 'rent_roll', value: null, status: 'verified', source: 'seller', documentId: 'doc-rr' },
  ];

  it('capitalizes verified NOI at a sourced cap rate and offers sensitivity', () => {
    const u = underwriteCommercial(commercialInput(verified, { capRate: { rate: 0.08, source: 'SYNTHETIC broker survey' } }));
    const income = u.approaches.find((a) => a.key === 'income_capitalization')!;
    expect(income.range!.mid).toBe(2_000_000);
    expect(u.sensitivity!.length).toBe(15);
    expect(u.sensitivity!.find((c) => c.capRate === 0.09 && c.noiChange === -0.1)!.value).toBe(1_600_000);
    const sales = u.approaches.find((a) => a.key === 'sales_price_per_sqft')!;
    expect(sales.evidenceCount).toBe(3);
    expect(u.decision).toBe('pursue');
  });

  it('never invents NOI, operating expenses or a cap rate', () => {
    const incomeOnly: FactRecord[] = [{ key: 'gross_operating_income', value: 250_000, status: 'reported', source: 'seller' }];
    expect(resolveNoi(incomeOnly)).toBeNull();
    const u = underwriteCommercial(commercialInput(incomeOnly, { capRate: { rate: 0.08, source: 'SYNTHETIC survey' } }));
    expect(u.approaches.find((a) => a.key === 'income_capitalization')!.range).toBeNull();
    expect(u.missing[0]).toMatch(/Operating expenses are not on file.*does not assume an expense ratio/);
    expect(u.sensitivity).toBeNull();
    expect(u.decision).toBe('review');
    // No cap rate: no income value, even with verified NOI.
    const noCap = underwriteCommercial(commercialInput(verified));
    expect(noCap.approaches.find((a) => a.key === 'income_capitalization')!.range).toBeNull();
    expect(noCap.missing.join(' ')).toMatch(/Halo has no default/);
    // A cap rate without a named source is not used.
    const unsourced = underwriteCommercial(commercialInput(verified, { capRate: { rate: 0.08, source: '  ' } }));
    expect(unsourced.approaches.find((a) => a.key === 'income_capitalization')!.range).toBeNull();
  });

  it('derives NOI only from income and expenses both on file, at the weaker status', () => {
    const noi = resolveNoi([
      { key: 'gross_operating_income', value: 300_000, status: 'verified', source: 'T12' },
      { key: 'operating_expenses', value: 120_000, status: 'reported', source: 'seller' },
    ]);
    expect(noi).toEqual({ value: 180_000, status: 'reported', derived: true });
  });

  it('cannot value a property with neither financials nor comparables', () => {
    const u = underwriteCommercial(commercialInput([], { comps: [] }));
    expect(u.valuation).toBeNull();
    expect(u.offerRange).toBeNull();
    expect(u.explanation[0]).toMatch(/cannot value this property yet/);
  });
});

describe('residential underwriting in the shared shape', () => {
  it('reports the unchanged ARV model', () => {
    const u = underwriteResidential({
      arv: 200_000,
      repairEstimate: 30_000,
      assignmentFee: 10_000,
      transactionCosts: 1_000,
      minNetProfit: 5_000,
      confidence: 0.8,
      minConfidence: 0.5,
      subtype: 'single_family',
      buyerDemand: noDemand,
    });
    expect(u.strategy).toBe('residential_arv');
    expect(u.offerRange!.high).toBe(100_000);
    expect(u.decision).toBe('pursue');
  });
});

describe('facts and diligence', () => {
  it('lists critical unknowns and keeps professional facts open until a report is filed', () => {
    const facts: FactRecord[] = [
      { key: 'gross_acres', value: 10, status: 'reported', source: 'realie' },
      { key: 'legal_access', value: true, status: 'reported', source: 'seller' },
    ];
    expect(criticalUnknowns('land', facts).map((f) => f.key)).toEqual(expect.arrayContaining(['zoning', 'utility_water', 'flood_zone']));
    const access = factChecklist('land', facts).find((i) => i.definition.key === 'legal_access')!;
    expect(access.status).toBe('reported');
    const survey = factChecklist('land', facts).find((i) => i.definition.key === 'survey_on_file')!;
    expect(survey.status).toBe('needs_diligence');
    const items = diligenceStatus('land', facts, ['title']);
    expect(items.find((i) => i.key === 'title')!.status).toBe('done');
    expect(items.find((i) => i.key === 'access')!.status).toBe('reported');
    expect(items.find((i) => i.key === 'zoning')!.status).toBe('open');
    expect(diligenceStatus('commercial', [], []).map((i) => i.key)).toContain('rent_roll');
  });
});

describe('sourcing criteria', () => {
  const candidate = (over: Partial<ParcelCandidate> = {}): ParcelCandidate => ({
    state: 'TX',
    county: 'Bastrop',
    apn: 'R1',
    acres: 12,
    buildingSqft: null,
    units: null,
    yearBuilt: null,
    landUse: 'VACANT LAND',
    assessedValue: 90_000,
    lastSaleDate: '2009-05-01',
    absentee: true,
    taxDelinquent: false,
    lienCount: 0,
    foreclosure: false,
    ownerKind: 'individual',
    classification: classifyProperty({ labels: ['VACANT LAND'], improvementValue: 0, acres: 12 }),
    improved: false,
    ...over,
  });

  it('applies land filters and rejects a record that lacks the filtered fact', () => {
    expect(matchesCriteria(candidate(), 'land', { minAcres: 5, absenteeOnly: true, minOwnershipYears: 10 }, NOW)).toEqual({ keep: true, reason: null });
    expect(matchesCriteria(candidate({ acres: null }), 'land', { minAcres: 5 }, NOW).reason).toBe('acreage unknown');
    expect(matchesCriteria(candidate(), 'land', { counties: ['Travis County'] }, NOW).keep).toBe(false);
    expect(matchesCriteria(candidate(), 'commercial', {}, NOW).reason).toBe('classified as land');
  });

  it('keeps an unclassified record whose suggestion fits, for a person to confirm', () => {
    const c = candidate({ classification: classifyProperty({ residentialFlag: false }) });
    const v = matchesCriteria(c, 'land', {}, NOW);
    expect(v.keep).toBe(true);
    expect(v.reason).toMatch(/does not say whether it is land or a commercial building/);
  });
});

describe('land buyers from the public record', () => {
  const sale = (i: number, buyer: string, over: Partial<NormalizedSale> = {}): NormalizedSale => ({
    source: 'county_csv',
    sourceRef: `syn-${buyer}-${i}`,
    state: 'TX',
    county: 'Bastrop',
    countyFips: '48021',
    city: null,
    zip: '78602',
    address: null,
    apn: `R${buyer}${i}`,
    saleDate: `2026-0${(i % 8) + 1}-10`,
    price: 100_000 + i * 10_000,
    buyerName: buyer,
    buyerKind: 'company',
    buyerMailingZip: '78701',
    sellerName: `SYNTHETIC SELLER ${i}`,
    sellerKind: 'individual',
    cashPurchase: true,
    armsLength: true,
    deedType: 'WARRANTY DEED',
    propertyType: 'VACANT LAND',
    acres: 8 + i,
    quality: 'recorded',
    ...over,
  });

  it('finds land investors and infers their category and acreage, marked as inferences', () => {
    const sales = [
      ...[0, 1, 2].map((i) => sale(i, 'SYNTHETIC HILL COUNTRY LAND LLC')),
      ...[0, 1, 2].map((i) => sale(i, 'SYNTHETIC HOMES LLC', { propertyType: 'VACANT RESIDENTIAL', acres: 0.25 })),
      ...[0, 1].map((i) => sale(i, 'SYNTHETIC FLIPPER LLC', { propertyType: 'SFR', acres: null, buildingSqft: 1500 })),
    ];
    const found = discoverInvestors(sales, { asOf: NOW });
    const land = found.find((c) => c.name === 'SYNTHETIC HILL COUNTRY LAND LLC')!;
    expect(land.buyBox.assetClasses).toEqual(['land']);
    expect(land.buyBox.acresMin).toBeGreaterThan(0);
    expect(land.categories.map((c) => c.category)).toEqual(expect.arrayContaining(['local_land_investor', 'land_investment_company']));
    expect(land.categories.every((c) => c.basis === 'inferred')).toBe(true);
    const builder = found.find((c) => c.name === 'SYNTHETIC HOMES LLC')!;
    expect(builder.categories.map((c) => c.category)).toContain('homebuilder');
    const flipper = found.find((c) => c.name === 'SYNTHETIC FLIPPER LLC')!;
    expect(flipper.buyBox.assetClasses).toEqual(['residential']);
  });

  it('does not let a name alone contradict what a buyer actually bought', () => {
    const cats = inferBuyerCategories({
      name: 'SYNTHETIC LAND CAPITAL LLC',
      kind: 'company',
      purchases: [0, 1, 2].map(() => ({ assetClass: 'residential' as const, subtype: 'single_family' as const, state: 'TX', county: 'Bastrop' })),
    });
    expect(cats.map((c) => c.category)).not.toContain('land_investment_company');
    expect(cats.map((c) => c.category)).toContain('residential_investor');
  });
});

describe('asset-aware buyer matching', () => {
  const buyer = (over: Partial<RankingBuyer> = {}): RankingBuyer => ({
    id: 'b1',
    name: 'SYNTHETIC BUYER',
    status: 'active',
    hasEmail: true,
    hasPhone: false,
    emailConsent: true,
    smsConsent: false,
    optedOut: false,
    buyBox: { locations: [], propertyTypes: [], priceMin: null, priceMax: null, maxRepairs: null, minArv: null },
    fundingType: 'cash',
    pof: { status: 'none', amount: null, expiresAt: null },
    transactions: [],
    engagement: { sent: 0, replies: 0, interested: 0 },
    outcomes: { offers: 0, accepted: 0, closed: 0, fellThrough: 0 },
    ...over,
  });
  const landDeal = {
    city: null,
    state: 'TX',
    zip: '78602',
    propertyType: 'VACANT LAND',
    buyerPrice: 110_000,
    arv: null,
    repairEstimate: null,
    assetClass: 'land' as const,
    assetSubtype: 'rural_acreage',
    county: 'Bastrop',
    acres: 12,
  };

  it('ranks a buyer with land purchases nearby above a house flipper for a land deal', () => {
    const landBuyer = buyer({
      id: 'land',
      transactions: [0, 1, 2].map((i) => ({
        city: null,
        state: 'TX',
        zip: '78602',
        propertyType: 'VACANT LAND',
        price: 100_000 + i * 5_000,
        closedAt: new Date('2026-05-01'),
        source: 'public_record' as const,
        assetClass: 'land' as const,
        acres: 10 + i,
      })),
    });
    const flipper = buyer({
      id: 'flip',
      transactions: [0, 1, 2].map(() => ({
        city: null,
        state: 'TX',
        zip: '78602',
        propertyType: 'SFR',
        price: 180_000,
        closedAt: new Date('2026-05-01'),
        source: 'public_record' as const,
        assetClass: 'residential' as const,
      })),
    });
    const a = matchBuyerToDeal(landDeal, landBuyer, NOW);
    const b = matchBuyerToDeal(landDeal, flipper, NOW);
    expect(a.score).toBeGreaterThan(b.score);
    expect(a.evidence.map((e) => e.text).join(' ')).toMatch(/inferred interest, not confirmed/);
    expect(b.evidence.map((e) => e.text).join(' ')).toMatch(/No land purchases on record/);
  });

  it('respects a stated buy box: wrong class or acreage is a mismatch', () => {
    const commercialOnly = matchBuyerToDeal(
      landDeal,
      buyer({ buyBox: { locations: ['TX'], propertyTypes: [], priceMin: null, priceMax: null, maxRepairs: null, minArv: null, assetClasses: ['commercial'] } }),
      NOW,
    );
    expect(commercialOnly.mismatches.join(' ')).toMatch(/buys commercial, not land/);
    const small = matchBuyerToDeal(
      landDeal,
      buyer({ buyBox: { locations: ['TX'], propertyTypes: [], priceMin: null, priceMax: null, maxRepairs: null, minArv: null, assetClasses: ['land'], acresMax: 5 } }),
      NOW,
    );
    expect(small.mismatches.join(' ')).toMatch(/12 acres outside their stated/);
  });

  it('scores a house deal exactly as before for a buyer with no asset classes', () => {
    const house = { city: 'Austin', state: 'TX', zip: '78702', propertyType: 'SFR', buyerPrice: 200_000, arv: 300_000, repairEstimate: 40_000 };
    const b = buyer({ buyBox: { locations: ['Austin'], propertyTypes: [], priceMin: 150_000, priceMax: 250_000, maxRepairs: null, minArv: null } });
    const legacy = matchBuyerToDeal(house, b, NOW);
    const classified = matchBuyerToDeal({ ...house, assetClass: 'residential' }, b, NOW);
    expect(classified.score).toBe(legacy.score);
    expect(classified.components).toEqual(legacy.components);
  });
});
