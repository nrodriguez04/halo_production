/**
 * The property-data pipeline against a real Postgres (docs/data-pipeline.md):
 * a county recorded-sales export, investor discovery, promotion into a
 * buyer the ranking can use, market intelligence, and provider facts on a
 * lead's property. SYNTHETIC records only; no provider is called.
 *
 *   INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
 */
import type { TestingModule } from '@nestjs/testing';
import { USER, buildModule, describeDb, fixtures } from './harness';
import { PrismaService } from '../../src/prisma.service';
import { RecordedSalesService } from '../../src/data/recorded-sales.service';
import { InvestorDiscoveryService } from '../../src/data/investor-discovery.service';
import { MarketIntelligenceService } from '../../src/data/market-intelligence.service';
import { PropertyFactsService } from '../../src/data/property-facts.service';
import { BuyerIntelligenceService } from '../../src/buyers/buyer-intelligence.service';
import { MarketsService } from '../../src/markets/markets.service';

/** A SYNTHETIC county export: two repeat cash buyers, a bank, retail sales. */
function countyCsv(): string {
  const lines = [
    'Instrument Number,Recorded Date,Consideration,Grantee,Grantor,Situs Address,Situs City,Situs Zip,Parcel ID,Loan Amount',
  ];
  const today = new Date();
  const ago = (d: number) => {
    const t = new Date(today.getTime() - d * 86_400_000);
    return `${t.getUTCMonth() + 1}/${t.getUTCDate()}/${t.getUTCFullYear()}`;
  };
  let n = 0;
  const add = (
    days: number,
    price: number,
    buyer: string,
    seller: string,
    parcel: string,
    loan = '',
  ) =>
    lines.push(
      `SYN-${++n},${ago(days)},"$${price.toLocaleString('en-US')}","${buyer}",${seller},${parcel} SYNTHETIC ST,Testville,75001,${parcel},${loan}`,
    );
  add(300, 110_000, 'SYNTHETIC CAPITAL, L.L.C.', 'Owner A', 'P1');
  add(200, 125_000, 'Synthetic Capital LLC', 'Owner B', 'P2');
  add(40, 140_000, 'SYNTHETIC CAPITAL LLC', 'Owner C', 'P3');
  add(120, 185_000, 'Retail Person', 'SYNTHETIC CAPITAL LLC', 'P1', '170000');
  add(250, 95_000, 'SYNTHETIC HOMES INC', 'Owner D', 'P4');
  add(90, 105_000, 'Synthetic Homes, Inc.', 'Owner E', 'P5');
  add(60, 150_000, 'SYNTHETIC BANK NA', 'Owner F', 'P6');
  add(61, 151_000, 'SYNTHETIC BANK NA', 'Owner G', 'P7');
  for (let i = 0; i < 20; i++)
    add(
      10 + i * 9,
      160_000 + i * 1_000,
      `Retail Buyer ${i}`,
      `Seller ${i}`,
      `R${i}`,
      '120000',
    );
  lines.push(',,,,,,,,,');
  lines.push('SYN-BAD,not a date,1,X,Y,Z,Testville,75001,Q,');
  return lines.join('\r\n');
}

describeDb('property data pipeline (synthetic, real database)', () => {
  let moduleRef: TestingModule;
  let fx: ReturnType<typeof fixtures>;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await buildModule();
    fx = fixtures(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await fx.cleanup();
    await moduleRef?.close();
  });

  it('imports a county export, finds the repeat cash buyers, and promotes one the ranking can use', async () => {
    const sales = moduleRef.get(RecordedSalesService);
    const discovery = moduleRef.get(InvestorDiscoveryService);
    const intel = moduleRef.get(BuyerIntelligenceService);
    const accountId = await fx.tenant();

    const file = await fx.doc(accountId, 'County export', {}, [], 'other', {
      text: countyCsv(),
      fileName: 'synthetic-county.csv',
    });
    const preview = await sales.previewCsv(accountId, file.id);
    expect(preview.guess).toMatchObject({
      sourceRef: 'Instrument Number',
      saleDate: 'Recorded Date',
      price: 'Consideration',
      buyerName: 'Grantee',
      sellerName: 'Grantor',
      apn: 'Parcel ID',
      mortgageAmount: 'Loan Amount',
    });
    const mapping = {
      ...preview.guess,
      city: 'Situs City',
      zip: 'Situs Zip',
      address: 'Situs Address',
    };
    const first = await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'TX',
      county: 'Synthetic',
      countyFips: '48999',
      mapping,
    });
    expect(first).toMatchObject({
      rows: 29,
      imported: 28,
      skipped: 1,
      duplicates: 0,
    });
    const again = await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'TX',
      county: 'Synthetic',
      countyFips: '48999',
      mapping,
    });
    expect(again).toMatchObject({ imported: 0, duplicates: 28 });

    const refreshed = await discovery.refresh(accountId, USER, { state: 'TX' });
    expect(refreshed.candidates).toBe(2);
    const list = await discovery.list(accountId, {});
    expect(list.map((c) => c.name).sort()).toEqual([
      'SYNTHETIC CAPITAL LLC',
      'Synthetic Homes, Inc.',
    ]);
    const capital = list.find(
      (c) => c.key === 'company:SYNTHETIC CAPITAL LLC',
    )!;
    expect(capital).toMatchObject({
      purchaseCount: 3,
      cashPurchases: 3,
      resales: 1,
    });

    const { buyerId } = await discovery.promote(accountId, capital.id, USER);
    const buyer = await prisma.buyer.findUnique({ where: { id: buyerId } });
    expect(buyer).toMatchObject({
      source: 'public_record',
      status: 'active',
      emailHash: null,
      phoneHash: null,
    });
    expect((buyer!.preferences as { inferred: boolean }).inferred).toBe(true);
    expect(
      await prisma.buyerTransaction.count({
        where: { buyerId, source: 'public_record' },
      }),
    ).toBe(3);

    // The ranking counts the recorded purchases as history, but the buyer
    // cannot be contacted until a person records contact and consent.
    const deal = await fx.seedDeal(accountId, 'TX');
    await prisma.property.updateMany({
      where: { accountId },
      data: { city: 'Testville', zip: '75001' },
    });
    const ranked = await intel.rankForDeal(accountId, deal.id);
    const match = ranked.matches.find((m) => m.buyerId === buyerId);
    expect(match).toBeDefined();
    expect(match!.contactable).toBe(false);
    expect(match!.evidence.map((e) => e.kind)).toContain('historical_purchase');

    // A second refresh does not offer the promoted buyer again.
    await discovery.refresh(accountId, USER, { state: 'TX' });
    expect((await discovery.list(accountId, {})).map((c) => c.key)).toEqual([
      'company:SYNTHETIC HOMES INC',
    ]);
  });

  it('ranks counties from recorded sales and recommends states by opportunity and legal readiness', async () => {
    const sales = moduleRef.get(RecordedSalesService);
    const intelligence = moduleRef.get(MarketIntelligenceService);
    const markets = moduleRef.get(MarketsService);
    const accountId = await fx.tenant();
    const file = await fx.doc(accountId, 'County export', {}, [], 'other', {
      text: countyCsv(),
      fileName: 'synthetic-county.csv',
    });
    const { guess } = await sales.previewCsv(accountId, file.id);
    await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'TX',
      county: 'Synthetic',
      countyFips: '48999',
      mapping: { ...guess, zip: 'Situs Zip' },
    });
    await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'GA',
      county: 'Other',
      countyFips: '13999',
      mapping: { ...guess, zip: 'Situs Zip' },
      source: 'county_csv_ga',
    });
    await markets.importResearch(accountId, USER, { states: ['TX', 'GA'] });
    await fx.approvedMarket(accountId, 'GA', {
      status: 'APPROVED_FOR_ACQUISITION',
    });

    const counties = await intelligence.geos(accountId, { level: 'county' });
    expect(counties.geos.map((g) => g.key).sort()).toEqual(['13999', '48999']);
    const ga = counties.geos.find((g) => g.key === '13999')!;
    const tx = counties.geos.find((g) => g.key === '48999')!;
    expect(ga.components.find((c) => c.key === 'legal')).toMatchObject({
      basis: 'policy',
      points: 10,
    });
    expect(tx.components.find((c) => c.key === 'legal')!.points).toBeLessThan(
      10,
    );
    expect(ga.opportunity).toBe(tx.opportunity);
    expect(ga.score).toBeGreaterThan(tx.score);

    const zips = await intelligence.geos(accountId, {
      level: 'zip',
      state: 'TX',
    });
    expect(zips.geos[0]).toMatchObject({ key: '75001', level: 'zip' });

    const recs = await intelligence.recommendations(accountId, 5);
    expect(recs.recommendations[0].state).toBe('GA');
    expect(recs.recommendations.map((r) => r.state)).toContain('TX');
    expect(recs.dataCoverage).toEqual({ counties: 2, states: 2 });
  });

  it('ranks a metro across state lines where its weakest state stands', async () => {
    const sales = moduleRef.get(RecordedSalesService);
    const intelligence = moduleRef.get(MarketIntelligenceService);
    const markets = moduleRef.get(MarketsService);
    const accountId = await fx.tenant();
    const file = await fx.doc(accountId, 'County export', {}, [], 'other', {
      text: countyCsv(),
      fileName: 'synthetic-county.csv',
    });
    const { guess } = await sales.previewCsv(accountId, file.id);
    // Shelby County, TN and DeSoto County, MS are both in the Memphis metro.
    await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'TN',
      county: 'Shelby',
      countyFips: '47157',
      mapping: { ...guess, zip: 'Situs Zip' },
    });
    await sales.importCsv(accountId, USER, {
      documentId: file.id,
      state: 'MS',
      county: 'DeSoto',
      countyFips: '28033',
      mapping: { ...guess, zip: 'Situs Zip' },
      source: 'county_csv_ms',
    });
    await markets.importResearch(accountId, USER, { states: ['TN', 'MS'] });
    await fx.approvedMarket(accountId, 'TN', {
      status: 'APPROVED_FOR_ACQUISITION',
    });

    const counties = await intelligence.geos(accountId, { level: 'county' });
    const metros = await intelligence.geos(accountId, { level: 'metro' });
    expect(metros.geos).toHaveLength(1);
    const memphis = metros.geos[0];
    expect(memphis).toMatchObject({
      level: 'metro',
      key: '32820',
      label: 'Memphis, TN-MS-AR',
      state: 'TN',
      states: ['MS', 'TN'],
      sales12m: counties.geos.reduce((n, g) => n + g.sales12m, 0),
    });
    // Approved in Tennessee, research only in Mississippi: the metro
    // scores Mississippi's standing, not Tennessee's.
    const shelby = counties.geos.find((g) => g.key === '47157')!;
    expect(shelby.components.find((c) => c.key === 'legal')!.points).toBe(10);
    expect(
      memphis.components.find((c) => c.key === 'legal')!.points,
    ).toBeLessThan(10);
  });

  it("puts a provider's facts on the lead's property and links the open deal to it", async () => {
    const facts = moduleRef.get(PropertyFactsService);
    const accountId = await fx.tenant();
    const lead = await prisma.lead.create({
      data: {
        accountId,
        status: 'enriching',
        canonicalAddress: '7 SYNTHETIC WAY',
        canonicalCity: 'Testville',
        canonicalState: 'Texas',
        canonicalZip: '75001',
      },
    });
    const deal = await prisma.deal.create({
      data: { accountId, leadId: lead.id, stage: 'negotiating' },
    });
    const propertyId = await facts.applyToLead(accountId, lead.id, {
      source: 'attom',
      sourceRef: 'SYN-1',
      address: null,
      city: null,
      state: 'TX',
      zip: '75001',
      county: 'Synthetic',
      countyFips: '48999',
      apn: 'P9',
      latitude: 32.9,
      longitude: -96.8,
      propertyType: 'SFR',
      beds: 3,
      baths: 2,
      sqft: 1500,
      lotSqft: null,
      yearBuilt: 1980,
      assessedValue: 150_000,
      marketValue: 190_000,
      lastSaleDate: '2015-04-01',
      lastSalePrice: 120_000,
      ownerName: 'SYNTHETIC Owner',
      ownerKind: 'individual',
      absentee: true,
      quality: 'reported',
    });
    const property = await prisma.property.findUnique({
      where: { id: propertyId! },
    });
    expect(property).toMatchObject({
      address: '7 SYNTHETIC WAY',
      state: 'TX',
      countyFips: '48999',
      beds: 3,
      estimatedValue: 190_000,
      dataSource: 'attom',
      dataQuality: 'reported',
      absentee: true,
    });
    expect(
      (await prisma.deal.findUnique({ where: { id: deal.id } }))!.propertyId,
    ).toBe(propertyId);

    // A later lookup without some facts never erases them.
    await facts.applyToLead(accountId, lead.id, {
      ...(property as object),
      source: 'regrid',
      sourceRef: 'R-1',
      beds: null,
      marketValue: null,
      quality: 'recorded',
      ownerName: null,
      ownerKind: null,
      lastSaleDate: null,
    } as never);
    expect(
      await prisma.property.findUnique({ where: { id: propertyId! } }),
    ).toMatchObject({ beds: 3, estimatedValue: 190_000, dataSource: 'regrid' });
  });
});
