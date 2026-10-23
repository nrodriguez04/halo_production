import { normalizePartyName, partyKey, partyKind } from './entities';
import {
  isoDate,
  propertyFromAttom,
  propertyFromRegrid,
  saleFromCountyRow,
  salesFromAttomHistory,
  type NormalizedSale,
} from './records';
import { discoverInvestors } from './investors';
import { aggregateSales, rankGeos, recommendMarkets, scoreGeo } from './market-intelligence';
import { CBSA_VINTAGE, countyName, metroByCode, metroForCounty } from './metros';

/** SYNTHETIC recorded sale; every name and parcel is made up. */
function sale(over: Partial<NormalizedSale>): NormalizedSale {
  return {
    source: 'county_csv',
    sourceRef: Math.random().toString(36).slice(2),
    state: 'TX',
    county: 'Synthetic',
    countyFips: '48999',
    city: 'Testville',
    zip: '75001',
    address: '1 SYNTHETIC ST',
    apn: null,
    saleDate: '2026-06-01',
    price: 150_000,
    buyerName: 'SYNTHETIC Holdings LLC',
    buyerKind: 'company',
    buyerMailingZip: null,
    sellerName: 'SYNTHETIC Owner',
    sellerKind: 'individual',
    cashPurchase: true,
    armsLength: true,
    deedType: 'warranty',
    propertyType: 'SFR',
    quality: 'recorded',
    ...over,
  };
}

const AS_OF = new Date('2026-10-22T00:00:00Z');

describe('recorded parties', () => {
  it('spells one company the same however the deed wrote it', () => {
    const forms = ['Synthetic Holdings, L.L.C.', 'SYNTHETIC HOLDINGS LLC', 'The Synthetic Holdings Limited Liability Company', 'synthetic holdings l l c'];
    expect(new Set(forms.map(normalizePartyName))).toEqual(new Set(['SYNTHETIC HOLDINGS LLC']));
  });

  it('tells companies, trusts, people, lenders and agencies apart', () => {
    expect(partyKind('Synthetic Properties Inc.')).toBe('company');
    expect(partyKind('Jane Synthetic Revocable Trust')).toBe('trust');
    expect(partyKind('Jane Q Synthetic')).toBe('individual');
    expect(partyKind('Synthetic Bank, N.A.')).toBe('lender');
    expect(partyKind('Secretary of Housing and Urban Development')).toBe('government');
    expect(partyKind('Federal National Mortgage Association')).toBe('government');
  });

  it('needs a mailing zip to match a person, since names repeat', () => {
    expect(partyKey('Jane Synthetic', null)).toBeNull();
    expect(partyKey('Jane Synthetic', '75001-1234')).toBe('individual:JANE SYNTHETIC:75001');
    expect(partyKey('Synthetic Holdings LLC')).toBe('company:SYNTHETIC HOLDINGS LLC');
  });
});

describe('provider records', () => {
  it('reads dates in the formats counties and providers use', () => {
    expect(isoDate('2026/3/7')).toBe('2026-03-07');
    expect(isoDate('03/07/2026')).toBe('2026-03-07');
    expect(isoDate('20260307')).toBe('2026-03-07');
    expect(isoDate('March 7')).toBeNull();
  });

  it('normalizes an ATTOM profile, keeping estimates apart from sales', () => {
    const p = propertyFromAttom({
      property: [
        {
          identifier: { attomId: 123, fips: '48201', apn: 'SYN-1' },
          address: { line1: '1 SYNTHETIC ST', locality: 'Houston', countrySubd: 'TX', postal1: '77002' },
          area: { countrysecsubd: 'Harris' },
          location: { latitude: '29.75', longitude: '-95.36' },
          summary: { proptype: 'SFR', yearbuilt: 1965, absenteeInd: 'ABSENTEE(MAIL AND SITUS NOT =)' },
          building: { rooms: { beds: 3, bathstotal: 2 }, size: { livingsize: 1450 } },
          assessment: { market: { mktttlvalue: 210000 }, assessed: { assdttlvalue: 180000 } },
          sale: { saleTransDate: '2019-05-01', amount: { saleamt: 140000 } },
          owner: { owner1: { fullname: 'SYNTHETIC RENTALS LLC' } },
        },
      ],
    })!;
    expect(p).toMatchObject({
      source: 'attom',
      sourceRef: '123',
      state: 'TX',
      county: 'Harris',
      countyFips: '48201',
      latitude: 29.75,
      beds: 3,
      sqft: 1450,
      marketValue: 210000,
      lastSalePrice: 140000,
      lastSaleDate: '2019-05-01',
      ownerKind: 'company',
      absentee: true,
      quality: 'reported',
    });
  });

  it('normalizes a Regrid parcel as a recorded assessor record', () => {
    const p = propertyFromRegrid({
      parcels: {
        features: [
          {
            properties: {
              fields: {
                ll_uuid: 'uuid-1',
                address: '2 SYNTHETIC AVE',
                scity: 'Phoenix',
                state2: 'AZ',
                szip5: '85001',
                county: 'Maricopa',
                geoid: '04013',
                parcelnumb: '123-45-678',
                owner: 'SYNTHETIC TRUST',
                mailadd: 'PO BOX 1',
                saledate: '2024-01-15',
                saleprice: 300000,
                yearbuilt: 1999,
              },
            },
          },
        ],
      },
    })!;
    expect(p).toMatchObject({ source: 'regrid', state: 'AZ', countyFips: '04013', apn: '123-45-678', ownerKind: 'trust', absentee: true, quality: 'recorded' });
  });

  it('reads a county export through the column mapping, inferring cash from the mortgage column', () => {
    const map = { sourceRef: 'Doc#', saleDate: 'Recorded', price: 'Consideration', buyerName: 'Grantee', sellerName: 'Grantor', mortgageAmount: 'Loan', zip: 'Zip' } as const;
    const cash = saleFromCountyRow({ 'Doc#': 'D1', Recorded: '06/01/2026', Consideration: '$150,000', Grantee: 'SYN LLC', Grantor: 'Jo Syn', Loan: '', Zip: '75001-1111' }, map, { source: 'county_csv', state: 'TX' });
    expect(cash).toMatchObject({ saleDate: '2026-06-01', price: 150000, buyerKind: 'company', cashPurchase: true, zip: '75001', quality: 'recorded' });
    const financed = saleFromCountyRow({ 'Doc#': 'D2', Recorded: '2026-06-02', Consideration: '100000', Grantee: 'Jo Syn', Grantor: 'X', Loan: '80000', Zip: '75001' }, map, { source: 'county_csv', state: 'TX' });
    expect(financed?.cashPurchase).toBe(false);
    expect(saleFromCountyRow({ 'Doc#': 'D3', Recorded: '' }, map, { source: 'county_csv', state: 'TX' })).toBeNull();
  });

  it('reads ATTOM sales history with buyers, sellers and mortgages', () => {
    const sales = salesFromAttomHistory({
      property: [
        {
          identifier: { attomId: 9, fips: '48201' },
          address: { line1: '3 SYNTHETIC RD', locality: 'Houston', countrySubd: 'TX', postal1: '77003' },
          salehistory: [
            { saleTransDate: '2026-01-10', amount: { saleamt: 90000 }, buyer: { name: 'SYN FLIPS LLC' }, seller: { name: 'Old Owner' }, mortgage: {} },
            { saleTransDate: '2026-05-10', amount: { saleamt: 160000 }, buyer: { name: 'New Owner' }, seller: { name: 'SYN FLIPS LLC' } },
          ],
        },
      ],
    });
    expect(sales).toHaveLength(2);
    expect(sales[0]).toMatchObject({ buyerKind: 'company', cashPurchase: true, countyFips: '48201' });
    expect(sales[1].cashPurchase).toBeNull();
  });
});

describe('investor discovery', () => {
  const sales = [
    sale({ sourceRef: 'a', saleDate: '2026-01-05', price: 100_000, apn: 'P1', buyerName: 'Synthetic Holdings, L.L.C.' }),
    sale({ sourceRef: 'b', saleDate: '2026-04-05', price: 120_000, apn: 'P2', buyerName: 'SYNTHETIC HOLDINGS LLC', cashPurchase: false }),
    sale({ sourceRef: 'c', saleDate: '2026-09-15', price: 140_000, apn: 'P3', buyerName: 'Synthetic Holdings LLC', zip: '75002' }),
    // They resold P1.
    sale({ sourceRef: 'd', saleDate: '2026-06-01', price: 180_000, apn: 'P1', buyerName: 'Retail Buyer', buyerKind: 'individual', sellerName: 'SYNTHETIC HOLDINGS LLC', sellerKind: 'company', cashPurchase: false }),
    // A bank taking back a house is not an investor.
    sale({ sourceRef: 'e', buyerName: 'Synthetic Bank NA', buyerKind: 'lender' }),
    sale({ sourceRef: 'f', buyerName: 'Synthetic Bank NA', buyerKind: 'lender' }),
    // One purchase is not a pattern.
    sale({ sourceRef: 'g', buyerName: 'One Time LLC' }),
  ];

  it('finds repeat buyers, with cash, resales and an inferred buy box', () => {
    const found = discoverInvestors(sales, { asOf: AS_OF });
    expect(found.map((f) => f.key)).toEqual(['company:SYNTHETIC HOLDINGS LLC']);
    const c = found[0];
    expect(c).toMatchObject({ purchaseCount: 3, cashPurchases: 2, financedPurchases: 1, resales: 1, medianHoldDays: 147, lastPurchase: '2026-09-15' });
    expect(c.buyBox.zips).toEqual(['75001', '75002']);
    expect(c.buyBox.priceMin).toBe(105_000);
    expect(c.buyBox.priceMax).toBe(135_000);
    expect(c.reasons.join(' ')).toContain('bought in the last 90 days');
  });

  it('ignores sales outside the window', () => {
    expect(discoverInvestors(sales, { asOf: new Date('2030-01-01T00:00:00Z'), windowDays: 365 })).toEqual([]);
  });
});

describe('market intelligence', () => {
  const many = Array.from({ length: 60 }, (_, i) =>
    sale({
      sourceRef: `s${i}`,
      saleDate: `2026-0${(i % 9) + 1}-1${i % 9}`,
      price: 120_000 + (i % 10) * 10_000,
      buyerName: i % 3 === 0 ? `SYNTHETIC Investor ${i % 12} LLC` : `Person ${i}`,
      buyerKind: i % 3 === 0 ? 'company' : 'individual',
      buyerMailingZip: '75001',
      cashPurchase: i % 3 === 0,
      apn: `A${i}`,
    }),
  );

  it('aggregates a county and explains its score', () => {
    const [g] = aggregateSales(many, 'county', AS_OF);
    expect(g).toMatchObject({ key: '48999', label: 'Synthetic County, TX', sales12m: 60, investorPurchases12m: 20 });
    const scored = scoreGeo({ ...g, marketStatus: 'RESEARCH_ONLY', classification: 'B', distressLeads: 12 }, AS_OF);
    expect(scored.components).toHaveLength(10);
    expect(scored.components.reduce((s, c) => s + c.max, 0)).toBe(100);
    expect(scored.components.find((c) => c.key === 'fee')).toMatchObject({ basis: 'estimate' });
    expect(scored.components.find((c) => c.key === 'profitability')).toMatchObject({ basis: 'unknown' });
    expect(scored.score).toBeGreaterThan(0);
    expect(scored.opportunity).toBeGreaterThan(0);
  });

  it('maps counties to metros from the Census delineation', () => {
    expect(CBSA_VINTAGE).toBe('2023-07');
    expect(metroForCounty('48113')).toEqual({
      code: '19100',
      title: 'Dallas-Fort Worth-Arlington, TX',
      metropolitan: true,
      states: ['TX'],
    });
    expect(metroForCounty('47157')?.states).toEqual(['TN', 'MS', 'AR']);
    expect(metroByCode('10100')?.metropolitan).toBe(false);
    expect(metroForCounty('48999')).toBeNull();
    expect(metroForCounty(null)).toBeNull();
    expect(countyName('48113')).toBe('Dallas County');
    expect(countyName('48999')).toBeNull();
    const [unnamed] = aggregateSales([sale({ county: null, countyFips: '48113' })], 'county', AS_OF);
    expect(unnamed.label).toBe('Dallas County, TX');
  });

  it('groups counties into one metro and leaves out sales outside every metro', () => {
    const geos = aggregateSales(
      [
        ...many.slice(0, 20).map((s) => ({ ...s, countyFips: '48113', county: 'Dallas' })),
        ...many.slice(20, 30).map((s) => ({ ...s, countyFips: '48439', county: 'Tarrant' })),
        ...many.slice(30, 40).map((s) => ({ ...s, countyFips: '28033', county: 'DeSoto', state: 'MS' })),
        ...many.slice(40),
      ],
      'metro',
      AS_OF,
    );
    expect(geos.map((g) => [g.key, g.label, g.state, g.states, g.sales12m])).toEqual([
      ['19100', 'Dallas-Fort Worth-Arlington, TX', 'TX', ['TX'], 30],
      ['32820', 'Memphis, TN-MS-AR', 'TN', ['MS'], 10],
    ]);
  });

  it('recommends states by opportunity times how close they are to operating', () => {
    const counties = rankGeos(
      [
        ...aggregateSales(many, 'county', AS_OF),
        ...aggregateSales(many.map((s) => ({ ...s, state: 'GA', countyFips: '13999', county: 'Other' })), 'county', AS_OF),
      ],
      AS_OF,
    );
    const recs = recommendMarkets(
      [
        { state: 'TX', status: 'PENDING_REQUIREMENTS', classification: 'B', nextStep: 'Upload templates', missing: 2 },
        { state: 'GA', status: 'RESEARCH_ONLY', classification: 'E', nextStep: null, missing: 0 },
        { state: 'AZ', status: 'ACTIVE', classification: 'B', nextStep: null, missing: 0 },
        { state: 'NC', status: 'BLOCKED', classification: 'D', nextStep: null, missing: 0 },
      ],
      counties,
    );
    expect(recs.map((r) => r.state)).toEqual(['TX', 'GA']);
    expect(recs[0].feasibility).toBeGreaterThan(recs[1].feasibility);
    expect(recs[0].topGeos[0].label).toBe('Synthetic County, TX');
  });
});

describe('county CSV', () => {
  it('reads quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const { parseCsv } = jest.requireActual('./csv') as typeof import('./csv');
    const text = '﻿Doc #,Grantee,Consideration\r\nD1,"SYNTHETIC, LLC","$1,000"\r\nD2,"Say ""hi""\nthere",5\n\n';
    const out = parseCsv(text);
    expect(out.headers).toEqual(['Doc #', 'Grantee', 'Consideration']);
    expect(out.rows).toEqual([
      { 'Doc #': 'D1', Grantee: 'SYNTHETIC, LLC', Consideration: '$1,000' },
      { 'Doc #': 'D2', Grantee: 'Say "hi"\nthere', Consideration: '5' },
    ]);
  });

  it('guesses which columns hold the sale fields', () => {
    const { guessSaleColumns } = jest.requireActual('./csv') as typeof import('./csv');
    expect(guessSaleColumns(['Instrument Number', 'Recorded Date', 'Consideration', 'Grantee', 'Grantor', 'Situs Address', 'Parcel ID', 'Loan Amount'])).toEqual({
      sourceRef: 'Instrument Number',
      saleDate: 'Recorded Date',
      price: 'Consideration',
      buyerName: 'Grantee',
      sellerName: 'Grantor',
      address: 'Situs Address',
      apn: 'Parcel ID',
      mortgageAmount: 'Loan Amount',
    });
  });
});
