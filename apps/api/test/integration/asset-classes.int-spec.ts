/**
 * Land and commercial wholesaling, Texas first (docs/asset-classes.md s12),
 * on a real Postgres. Every parcel, sale, buyer and document is SYNTHETIC.
 * The provider search and the public map service are stand-ins, cost
 * control refuses any provider call, and the queue is stubbed: nothing is
 * marketed, signed, paid for or activated.
 */
import {
  DB,
  USER,
  buildModule,
  describeDb,
  fixtures,
  queue,
  SYNTHETIC_TEMPLATE_TEXT,
} from './harness';
import type { TestingModule } from '@nestjs/testing';
import type { Listing } from '../../src/integrations/listings/listing-source.types';
import { ListingSourceService } from '../../src/integrations/listings/listing-source.service';
import { PublicGisService } from '../../src/integrations/public-gis/public-gis.service';
import { LeadsModule } from '../../src/leads/leads.module';
import { ListingImportService } from '../../src/leads/listing-import.service';
import { SourcingService } from '../../src/sourcing/sourcing.service';
import { ControlPlaneService } from '../../src/control-plane/control-plane.service';
import { PropertyIntelligenceService } from '../../src/assets/property-intelligence.service';
import { AssetUnderwritingService } from '../../src/disposition/asset-underwriting.service';
import { OffersService } from '../../src/disposition/offers.service';
import { RecordedSalesService } from '../../src/data/recorded-sales.service';
import { InvestorDiscoveryService } from '../../src/data/investor-discovery.service';
import { BuyerIntelligenceService } from '../../src/buyers/buyer-intelligence.service';
import { TemplateCatalogService } from '../../src/markets/template-catalog.service';
import { DisclosureGateService } from '../../src/compliance/disclosure-gate.service';
import { IntegrationCostControlService } from '../../src/cost-control/cost-control.service';
import { propertyLabel, type NormalizedSale } from '@halo/shared';

jest.setTimeout(120_000);

/** A Realie-shaped parcel from the stand-in search. */
function parcel(
  apn: string,
  over: {
    street?: string;
    zip?: string;
    city?: string;
    label: string;
    acres: number | null;
    county?: string;
    useCode?: string;
    residential?: boolean | null;
    livingArea?: number | null;
    hasStructure?: boolean | null;
    lat?: number;
    lng?: number;
  },
): Listing {
  return {
    listingKey: `syn-${apn}`,
    mlsId: null,
    status: 'Absentee',
    listPrice: null,
    address: {
      street: over.street ?? '',
      city: over.city ?? '',
      state: 'TX',
      postalCode: over.zip ?? '',
    },
    propertyType: over.label,
    bedrooms: null,
    bathrooms: null,
    livingArea: over.livingArea ?? null,
    yearBuilt: null,
    daysOnMarket: null,
    listDate: null,
    modifiedAt: null,
    listingAgent: null,
    ownerName: 'SYNTHETIC OWNER',
    signals: ['owner:absentee'],
    summary: 'SYNTHETIC county record',
    parcel: {
      apn,
      county: over.county ?? 'Bastrop',
      latitude: over.lat ?? 30.11,
      longitude: over.lng ?? -97.32,
      acres: over.acres,
      lotSqft: null,
      livingSqft: over.livingArea ?? null,
      buildingSqft: over.livingArea ?? null,
      units: null,
      yearBuilt: null,
      landUse: over.useCode ?? null,
      residentialFlag: over.residential ?? null,
      hasStructure: over.hasStructure ?? null,
      improvementValue: null,
      assessedValue: 90_000,
      marketValue: 120_000,
      lastSaleDate: '2008-04-01',
      lastSalePrice: 40_000,
      absentee: true,
      taxDelinquent: false,
      lienCount: 0,
      foreclosure: false,
      ownerKind: 'individual',
    },
    raw: { synthetic: true, apn },
  };
}

const FIRST_PULL: Listing[] = [
  // No street address: identified by APN and county.
  parcel('R-SYN-1001', { label: 'VACANT LAND', acres: 12.4 }),
  parcel('R-SYN-1002', {
    label: 'AGRICULTURAL',
    acres: 30,
    street: '0 SYNTHETIC Ranch Rd',
    zip: '78602',
    city: 'Bastrop',
  }),
  parcel('R-SYN-1003', {
    label: 'VACANT RESIDENTIAL',
    acres: 0.4,
    street: '12 SYNTHETIC Lot Ln',
    zip: '78602',
    city: 'Bastrop',
  }),
  parcel('R-SYN-1004', { label: 'VACANT COMMERCIAL LAND', acres: 2.1 }),
  // A county use code Halo cannot read: kept, unclassified, for a person.
  parcel('R-SYN-1005', {
    label: '1110',
    useCode: '1110',
    residential: false,
    acres: 8,
  }),
  // The same parcel as R-SYN-1001, spelled differently by the source.
  parcel('R SYN 1001', { label: 'VACANT LAND', acres: 12.4 }),
  // A house: a land market leaves it out.
  parcel('R-SYN-1006', {
    label: 'SFR',
    acres: 0.3,
    livingArea: 1600,
    street: '9 SYNTHETIC Home Ct',
    zip: '78602',
    city: 'Bastrop',
  }),
];
// An overlapping market sees one parcel the first already holds.
const SECOND_PULL: Listing[] = [
  parcel('R-SYN-1002', {
    label: 'AGRICULTURAL',
    acres: 30,
    street: '0 SYNTHETIC Ranch Rd',
    zip: '78602',
    city: 'Bastrop',
  }),
];

function sale(
  i: number,
  buyer: string,
  over: Partial<NormalizedSale> = {},
): NormalizedSale {
  return {
    source: 'county_csv',
    sourceRef: `syn-sale-${buyer}-${i}`,
    state: 'TX',
    county: 'Bastrop',
    countyFips: '48021',
    city: null,
    zip: '78602',
    address: null,
    apn: `R-SYN-S-${buyer.length}-${i}`,
    saleDate: new Date(Date.now() - (60 + i * 45) * 86_400_000)
      .toISOString()
      .slice(0, 10),
    price: 110_000 + i * 8_000,
    buyerName: buyer,
    buyerKind: 'company',
    buyerMailingZip: '78701',
    sellerName: `SYNTHETIC SELLER ${i}`,
    sellerKind: 'individual',
    cashPurchase: true,
    armsLength: true,
    deedType: 'WARRANTY DEED',
    propertyType: 'VACANT LAND',
    acres: 9 + i,
    quality: 'recorded',
    ...over,
  };
}

describeDb(
  'Texas land and commercial lifecycle (real Postgres, SYNTHETIC data)',
  () => {
    let moduleRef: TestingModule;
    let f: ReturnType<typeof fixtures>;
    let sourcing: SourcingService;
    let pull: Listing[] = FIRST_PULL;
    const searches: Array<Record<string, unknown>> = [];
    const sources = {
      search: jest.fn(
        async (source: string, criteria: Record<string, unknown>) => {
          searches.push(criteria);
          return {
            source,
            feed: 'synthetic',
            listings: pull,
            total: pull.length,
          };
        },
      ),
      statuses: () => ['Absentee'],
    };
    const gis = {
      floodZones: jest.fn(async () => ({
        zones: [
          {
            zone: 'X',
            subtype: 'AREA OF MINIMAL FLOOD HAZARD',
            specialFloodHazard: false,
          },
        ],
        worst: 'X',
        sourceUrl: 'https://synthetic.test/fema',
      })),
      wetlands: jest.fn(async () => ({
        types: [],
        sourceUrl: 'https://synthetic.test/nwi',
      })),
    };
    const automation = {
      createRun: jest.fn().mockResolvedValue({ id: 'run-synthetic' }),
      startRun: jest.fn(),
      completeRun: jest.fn(),
      failRun: jest.fn(),
    };

    beforeAll(async () => {
      moduleRef = await buildModule({
        imports: [LeadsModule],
        overrides: [
          { provide: ListingSourceService, useValue: sources },
          { provide: PublicGisService, useValue: gis },
        ],
      });
      f = fixtures(moduleRef);
      sourcing = new SourcingService(
        f.prisma,
        moduleRef.get(ListingImportService, { strict: false }),
        automation as never,
        moduleRef.get(ControlPlaneService, { strict: false }),
        f.markets,
      );
    });

    afterAll(async () => {
      if (!DB) return;
      await f.cleanup();
      await moduleRef.close();
    });

    const get = <T>(t: new (...a: never[]) => T): T =>
      moduleRef.get(t as never, { strict: false });

    it('sources, dedupes, classifies and values Texas land, finds land investors, and keeps every gate shut', async () => {
      const a = await f.tenant();
      const intelligence = get(PropertyIntelligenceService);

      // 1. A Texas land sourcing market with an asset-specific filter; it starts manual.
      const market = await sourcing.create(a, {
        state: 'TX',
        sources: ['realie'],
        assetClasses: ['land'],
        criteria: {
          land: { counties: ['Bastrop'], minAcres: 0.25, vacantOnly: true },
        },
      });
      expect(market).toMatchObject({
        cadence: 'manual',
        nextRunAt: null,
        assetClasses: ['land'],
      });
      const estimate = await sourcing.estimate(a, {
        state: 'TX',
        sources: ['realie'],
        assetClasses: ['land'],
        cadence: 'manual',
      });
      expect(estimate.status[0]).toMatchObject({
        assetClass: 'land',
        researchOnly: true,
      });
      expect(estimate.coverage.find((r) => r.filter === 'acres')?.realie).toBe(
        'halo',
      );

      // 2. A small manual batch: five parcels in, the duplicate and the house out.
      const run = await sourcing.runNow(a, market.id, USER, { limit: 10 });
      expect(searches[0]).toMatchObject({
        limit: 10,
        assetClasses: ['land'],
        land: { counties: ['Bastrop'], minAcres: 0.25 },
      });
      expect(run.outcomes[0]).toMatchObject({
        ok: true,
        created: 5,
        duplicates: 1,
        filtered: 1,
        unclassified: 1,
      });
      expect(run.outcomes[0].filteredReasons).toEqual({
        'classified as residential': 1,
      });
      const props = await f.prisma.property.findMany({
        where: { accountId: a },
        orderBy: { apn: 'asc' },
      });
      expect(props.map((p) => [p.apn, p.assetClass, p.assetSubtype])).toEqual([
        ['R-SYN-1001', 'land', 'rural_acreage'],
        ['R-SYN-1002', 'land', 'agricultural'],
        ['R-SYN-1003', 'land', 'residential_lot'],
        ['R-SYN-1004', 'land', 'commercial_land'],
        ['R-SYN-1005', null, null],
      ]);
      expect(props.every((p) => p.parcelKey?.startsWith('TX|bastrop|'))).toBe(
        true,
      );

      // An overlapping market does not make a second lead for a parcel already held.
      const overlap = await sourcing.create(a, {
        label: 'Bastrop ZIP land',
        state: 'TX',
        postalCode: '78602',
        sources: ['realie'],
        assetClasses: ['land'],
      });
      pull = SECOND_PULL;
      const second = await sourcing.runNow(a, overlap.id, USER);
      pull = FIRST_PULL;
      expect(second.outcomes[0]).toMatchObject({ created: 0, duplicates: 1 });
      expect(await f.prisma.lead.count({ where: { accountId: a } })).toBe(5);

      // A person confirms what county code 1110 means once; it applies to the record.
      const mapped = await intelligence.addCodeMapping(a, USER, {
        state: 'TX',
        county: 'Bastrop',
        code: '1110',
        assetClass: 'land',
        subtype: 'rural_acreage',
      });
      expect(mapped.applied).toBe(1);
      expect(
        (
          await f.prisma.property.findFirst({
            where: { accountId: a, apn: 'R-SYN-1005' },
          })
        )?.assetClassBasis,
      ).toBe('mapping');

      // 3. The parcel with no street address is a usable property and lead.
      const raw = props.find((p) => p.apn === 'R-SYN-1001')!;
      expect(raw.address).toBeNull();
      expect(propertyLabel(raw)).toBe('Parcel R-SYN-1001, Bastrop County, TX');
      const rawLead = await f.prisma.lead.findUnique({
        where: { id: raw.leadId! },
      });
      expect(rawLead).toMatchObject({
        canonicalAddress: null,
        canonicalState: 'TX',
      });
      expect(rawLead!.tags).toEqual(
        expect.arrayContaining([
          'source:realie',
          'asset:land',
          'asset:rural_acreage',
        ]),
      );
      // Enrichment from the free public maps (a stand-in here).
      await intelligence.checkPublicRecords(a, raw.id, USER);
      const view = await intelligence.view(a, raw.id);
      expect(view.facts.find((x) => x.key === 'flood_zone')).toMatchObject({
        value: 'X',
        status: 'verified',
      });
      expect(view.facts.find((x) => x.key === 'gross_acres')).toMatchObject({
        value: 12.4,
        status: 'reported',
      });
      expect(view.facts.find((x) => x.key === 'legal_access')?.status).toBe(
        'needs_diligence',
      );
      expect(view.criticalUnknowns).toEqual(
        expect.arrayContaining(['Legal access', 'Water service']),
      );

      // 4. An evidence-based land valuation, not the residential ARV formula.
      const sales = get(RecordedSalesService);
      await sales.ingest(a, [
        ...[0, 1, 2].map((i) => sale(i, 'SYNTHETIC HILL COUNTRY LAND LLC')),
        ...[0, 1, 2].map((i) =>
          sale(i + 3, 'SYNTHETIC LOST PINES ACREAGE LLC'),
        ),
        ...[0, 1].map((i) =>
          sale(i, 'SYNTHETIC FLIPS LLC', {
            propertyType: 'SFR',
            acres: null,
            buildingSqft: 1500,
            price: 210_000,
          }),
        ),
      ]);
      expect(
        await f.prisma.recordedSale.count({
          where: { accountId: a, assetClass: 'land' },
        }),
      ).toBe(6);
      const deal = await f.prisma.deal.create({
        data: {
          accountId: a,
          leadId: raw.leadId,
          propertyId: raw.id,
          stage: 'negotiating',
        },
      });
      const u = await get(AssetUnderwritingService).forDeal(a, deal.id, {
        store: true,
      });
      expect(u.strategy).toBe('land_comparables');
      expect(u.approaches[0].evidenceCount).toBe(6);
      expect(u.valuation!.low).toBeLessThan(u.valuation!.high);
      expect(u.explanation.join(' ')).not.toMatch(/ARV|0\.7/);
      // 8. The recommendation names the unknowns and risks.
      expect(u.decision).toBe('review');
      expect(u.missing.join(' ')).toMatch(/Legal access is not established/);
      const stored = await f.prisma.underwritingResult.findUnique({
        where: { dealId: deal.id },
      });
      expect(stored).toMatchObject({
        assetClass: 'land',
        strategy: 'land_comparables',
      });
      // The seller offer is bounded by the land offer range, never the residential MAO.
      await expect(
        get(OffersService).setSellerOffer(a, deal.id, USER, {
          amount: u.offerRange!.high + 50_000,
        }),
      ).rejects.toMatchObject({ response: { code: 'OFFER_OUT_OF_BOUNDS' } });

      // 5. Buyer discovery finds the land investors and ranks them for the land deal.
      const discovery = get(InvestorDiscoveryService);
      await discovery.refresh(a, USER, { state: 'TX' });
      const candidates = await f.prisma.buyerCandidate.findMany({
        where: { accountId: a },
        orderBy: { name: 'asc' },
      });
      const land = candidates.filter((c) => c.assetClasses.includes('land'));
      expect(land.map((c) => c.name)).toEqual([
        'SYNTHETIC HILL COUNTRY LAND LLC',
        'SYNTHETIC LOST PINES ACREAGE LLC',
      ]);
      const cats = land[0].categories as Array<{
        category: string;
        basis: string;
      }>;
      expect(cats.every((c) => c.basis === 'inferred')).toBe(true);
      expect(cats.map((c) => c.category)).toContain('local_land_investor');
      for (const c of candidates) await discovery.promote(a, c.id, USER);
      const ranked = await get(BuyerIntelligenceService).rankForDeal(
        a,
        deal.id,
      );
      expect(ranked.matches[0].name).toMatch(/LAND LLC|ACREAGE LLC/);
      const flips = ranked.matches.find(
        (m) => m.name === 'SYNTHETIC FLIPS LLC',
      )!;
      expect(flips.score).toBeLessThan(ranked.matches[0].score);

      // 9. Texas templates by asset class; the Texas notice still applies under nationwide mode.
      await f.approvedTemplate(a, 'purchase_agreement', ['TX']);
      const landDoc = await f.doc(a, 'land PA', {}, [], 'agreement_template', {
        text: SYNTHETIC_TEMPLATE_TEXT.purchase_agreement,
        fileName: 'land-pa.txt',
      });
      const { version } = await f.templates.create(a, USER, {
        kind: 'purchase_agreement',
        name: 'SYNTHETIC TX land PA',
        documentId: landDoc.id,
        states: ['TX'],
        assetClasses: ['land'],
      });
      const memo = await f.doc(
        a,
        'Counsel template approval',
        {},
        [],
        'compliance',
      );
      await f.templates.approve(a, version.id, USER, {
        counselName: 'SYNTHETIC Counsel',
        approvalDocumentId: memo.id,
        attest: true,
      });
      const catalog = get(TemplateCatalogService);
      expect(
        (
          await catalog.selectApproved(a, 'purchase_agreement', 'TX', null, {
            assetClass: 'land',
          })
        )?.name,
      ).toBe('SYNTHETIC TX land PA');
      expect(
        (
          await catalog.selectApproved(a, 'purchase_agreement', 'TX', null, {
            assetClass: 'residential',
          })
        )?.name,
      ).toMatch(/SYNTHETIC purchase_agreement TX/);
      expect(
        await catalog.selectApproved(a, 'purchase_agreement', 'TX', null, {
          assetClass: 'commercial',
        }),
      ).toBeNull();
      await f.markets.openNationwide(a, USER, {
        openedByName: 'SYNTHETIC Owner',
        attest: true,
        activities: ['seller_outreach'],
        assetClasses: ['land'],
      });
      const notice = await get(DisclosureGateService).equitableInterest(
        a,
        deal.id,
      );
      expect(notice).toMatchObject({
        required: true,
        satisfied: false,
        state: 'TX',
      });

      // 10. Nothing was marketed, signed, paid for or activated.
      expect(
        (get(IntegrationCostControlService).checkAndCall as jest.Mock).mock
          .calls,
      ).toHaveLength(0);
      expect(queue.enqueueCommunication).not.toHaveBeenCalled();
      const tx = await f.prisma.market.findFirst({
        where: { accountId: a, state: 'TX' },
      });
      expect(tx?.requestedStatus).toBe('RESEARCH_ONLY');
      const landEval = await f.markets.evaluate(a, 'TX', {
        assetClass: 'land',
      });
      // The partial nationwide decision opened seller outreach for land only.
      expect(landEval!.evaluation.activities.seller_outreach.allowed).toBe(
        true,
      );
      expect(landEval!.evaluation.activities.buyer_marketing.allowed).toBe(
        false,
      );
      const commercialEval = await f.markets.evaluate(a, 'TX', {
        assetClass: 'commercial',
      });
      expect(
        commercialEval!.evaluation.activities.seller_outreach.allowed,
      ).toBe(false);
    });

    it('analyzes a commercial property on commercial metrics and refuses to invent NOI', async () => {
      const a = await f.tenant();
      const intelligence = get(PropertyIntelligenceService);
      const make = async (apn: string) => {
        const lead = await f.prisma.lead.create({
          data: {
            accountId: a,
            status: 'new',
            canonicalState: 'TX',
            canonicalOwner: 'SYNTHETIC OWNER',
          },
        });
        const p = await f.prisma.property.create({
          data: {
            accountId: a,
            leadId: lead.id,
            state: 'TX',
            county: 'Travis',
            apn,
            address: `${apn} SYNTHETIC Commerce Dr`,
            city: 'Austin',
            zip: '78701',
            propertyType: 'RETAIL',
            buildingSqft: 10_000,
          },
        });
        await intelligence.classify(a, p.id);
        return {
          p: (await f.prisma.property.findUnique({ where: { id: p.id } }))!,
          deal: await f.prisma.deal.create({
            data: {
              accountId: a,
              leadId: lead.id,
              propertyId: p.id,
              stage: 'negotiating',
            },
          }),
        };
      };
      await get(RecordedSalesService).ingest(a, [
        sale(0, 'SYNTHETIC RETAIL HOLDINGS', {
          county: 'Travis',
          propertyType: 'RETAIL',
          acres: null,
          buildingSqft: 10_500,
          price: 2_100_000,
        }),
        sale(1, 'SYNTHETIC RETAIL HOLDINGS', {
          county: 'Travis',
          propertyType: 'RETAIL',
          acres: null,
          buildingSqft: 9_000,
          price: 1_800_000,
        }),
        sale(2, 'SYNTHETIC STRIP CENTER LP', {
          county: 'Travis',
          propertyType: 'RETAIL',
          acres: null,
          buildingSqft: 12_000,
          price: 2_600_000,
        }),
      ]);

      // 6. A commercial property, analyzed with commercial metrics.
      const verified = await make('C-SYN-1');
      expect(verified.p).toMatchObject({
        assetClass: 'commercial',
        assetSubtype: 'retail',
      });
      const t12 = await f.doc(a, 'SYNTHETIC T12', {}, [], 'other');
      await intelligence.recordFact(a, verified.p.id, USER, {
        key: 'noi',
        value: 160_000,
        status: 'verified',
        source: 'SYNTHETIC T12 checked',
        documentId: t12.id,
      });
      await intelligence.recordFact(a, verified.p.id, USER, {
        key: 'cap_rate',
        value: 8,
        status: 'reported',
        source: 'SYNTHETIC broker survey',
      });
      const c = await get(AssetUnderwritingService).forDeal(
        a,
        verified.deal.id,
      );
      expect(c.strategy).toBe('commercial_income_and_sales');
      expect(
        c.approaches.find((x) => x.key === 'income_capitalization')!.range!.mid,
      ).toBe(2_000_000);
      expect(
        c.approaches.find((x) => x.key === 'sales_price_per_sqft')!
          .evidenceCount,
      ).toBe(3);
      expect(c.sensitivity!.length).toBeGreaterThan(0);

      // 7. Income without expenses: no NOI is assumed and no value is made up.
      const thin = await make('C-SYN-2');
      await intelligence.recordFact(a, thin.p.id, USER, {
        key: 'gross_operating_income',
        value: 250_000,
        status: 'reported',
        source: 'seller',
      });
      const t = await get(AssetUnderwritingService).forDeal(a, thin.deal.id);
      expect(
        t.approaches.find((x) => x.key === 'income_capitalization')!.range,
      ).toBeNull();
      expect(t.missing[0]).toMatch(
        /Operating expenses are not on file.*does not assume an expense ratio/,
      );
      expect(t.sensitivity).toBeNull();
      expect(t.decision).toBe('review');
      expect(
        (get(IntegrationCostControlService).checkAndCall as jest.Mock).mock
          .calls,
      ).toHaveLength(0);
    });
  },
);
