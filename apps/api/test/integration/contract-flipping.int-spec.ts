/**
 * The contract-flipping lifecycle against a real Postgres
 * (docs/contract-flipping.md s9). Every service is the real one; only the
 * BullMQ queue (nothing is ever sent) and the HTTP auth guards are stubbed.
 *
 * Every record here is a SYNTHETIC fixture on its own throwaway tenant:
 * no real buyer, seller, property, offer or fee. Run against a scratch
 * database only:
 *
 *   INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
 *
 * Without INTEGRATION_DATABASE_URL the suite is skipped.
 */
import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';

const DB = process.env.INTEGRATION_DATABASE_URL;
if (DB) process.env.DATABASE_URL = DB;
process.env.PII_ENCRYPTION_KEY_V1 =
  process.env.PII_ENCRYPTION_KEY_V1 ?? '11'.repeat(32);
process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION =
  process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION ?? '1';
process.env.PII_INDEX_KEY = process.env.PII_INDEX_KEY ?? '22'.repeat(32);
process.env.PUBLIC_APP_URL = 'https://app.synthetic.test';
process.env.NODE_ENV = 'test';

import { PrismaService } from '../../src/prisma.service';
import { DispositionModule } from '../../src/disposition/disposition.module';
import { ComplianceModule } from '../../src/compliance/compliance.module';
import { ControlPlaneModule } from '../../src/control-plane/control-plane.module';
import { PIIModule } from '../../src/pii/pii.module';
import { LeadPiiModule } from '../../src/leads/lead-pii.module';
import { AuditModule } from '../../src/audit/audit.module';
import { OpsAlertService } from '../../src/alerts/ops-alert.service';
import { QueueService } from '../../src/queues/queue.service';
import { AuthGuard } from '../../src/auth/auth.guard';
import { PermissionsGuard } from '../../src/auth/permissions.guard';
import { DealsService } from '../../src/deals/deals.service';
import { PurchaseAgreementsService } from '../../src/disposition/purchase-agreements.service';
import { JurisdictionPoliciesService } from '../../src/disposition/jurisdiction-policies.service';
import { DispositionEligibilityService } from '../../src/disposition/eligibility.service';
import { BuyerIntelligenceService } from '../../src/buyers/buyer-intelligence.service';
import { CampaignsService } from '../../src/disposition/campaigns.service';
import { PublicDealPagesService } from '../../src/disposition/public-deal-pages.service';
import { OffersService } from '../../src/disposition/offers.service';
import { AssignmentsService } from '../../src/disposition/assignments.service';
import { ClosingService } from '../../src/disposition/closing.service';
import { CommandCenterService } from '../../src/disposition/command-center.service';
import {
  DealPackagesService,
  numbersIn,
} from '../../src/disposition/deal-packages.service';
import { OptOutService } from '../../src/compliance/opt-out.service';
import { protectBuyerContact } from '../../src/buyers/buyer-pii';
import { StorageService } from '../../src/storage/storage.service';
import { AgreementDraftingService } from '../../src/disposition/agreement-drafting.service';
import { Readable } from 'stream';

@Global()
@Module({
  providers: [
    {
      provide: OpsAlertService,
      useValue: { send: jest.fn(), configured: () => false },
    },
  ],
  exports: [OpsAlertService],
})
class TestAlertsModule {}

/** Object storage in memory: the suite never touches a real bucket. */
const objects = new Map<string, Buffer>();
const memoryStorage = {
  upload: jest.fn(
    async (tenant: string, category: string, name: string, body: Buffer) => {
      const key = `${tenant}/${category}/${name}`;
      objects.set(key, Buffer.from(body));
      return { key };
    },
  ),
  download: jest.fn(async (key: string) => ({
    body: Readable.from([objects.get(key) ?? Buffer.alloc(0)]),
    contentType: 'text/plain',
  })),
  delete: jest.fn(async (key: string) => void objects.delete(key)),
};

const d = (days: number) => new Date(Date.now() + days * 86_400_000);
const USER = 'synthetic-operator';
const ALL_CONFIRMED = {
  parties: true,
  property: true,
  purchase_price: true,
  earnest_money: true,
  closing_deadline: true,
  assignment_clause: true,
  signatures: true,
} as const;

const describeDb = DB ? describe : describe.skip;

describeDb(
  'contract flipping, end to end (synthetic fixtures, real database)',
  () => {
    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let deals: DealsService;
    let agreements: PurchaseAgreementsService;
    let policies: JurisdictionPoliciesService;
    let eligibility: DispositionEligibilityService;
    let intel: BuyerIntelligenceService;
    let campaigns: CampaignsService;
    let pages: PublicDealPagesService;
    let offers: OffersService;
    let assignments: AssignmentsService;
    let closing: ClosingService;
    let center: CommandCenterService;
    let packages: DealPackagesService;
    let optOut: OptOutService;
    let drafting: AgreementDraftingService;
    const queue = {
      enqueueCommunication: jest.fn().mockResolvedValue({}),
      enqueueAgent: jest.fn().mockResolvedValue({}),
    };
    const tenants: string[] = [];

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          TestAlertsModule,
          ComplianceModule,
          ControlPlaneModule,
          PIIModule,
          LeadPiiModule,
          AuditModule,
          DispositionModule,
        ],
      })
        .overrideProvider(QueueService)
        .useValue(queue)
        .overrideProvider(StorageService)
        .useValue(memoryStorage)
        .overrideGuard(AuthGuard)
        .useValue({ canActivate: () => true })
        .overrideGuard(PermissionsGuard)
        .useValue({ canActivate: () => true })
        .compile();
      prisma = moduleRef.get(PrismaService);
      deals = moduleRef.get(DealsService);
      agreements = moduleRef.get(PurchaseAgreementsService);
      policies = moduleRef.get(JurisdictionPoliciesService);
      eligibility = moduleRef.get(DispositionEligibilityService);
      intel = moduleRef.get(BuyerIntelligenceService);
      campaigns = moduleRef.get(CampaignsService);
      pages = moduleRef.get(PublicDealPagesService);
      offers = moduleRef.get(OffersService);
      assignments = moduleRef.get(AssignmentsService);
      closing = moduleRef.get(ClosingService);
      center = moduleRef.get(CommandCenterService);
      packages = moduleRef.get(DealPackagesService);
      optOut = moduleRef.get(OptOutService);
      drafting = moduleRef.get(AgreementDraftingService);
    });

    afterAll(async () => {
      if (!prisma) return;
      // Best-effort cleanup of every synthetic tenant (cascades remove children).
      for (const accountId of tenants) {
        await prisma.closingFile.deleteMany({ where: { accountId } });
        await prisma.deal.deleteMany({ where: { accountId } });
        await prisma.buyer.deleteMany({ where: { accountId } });
        await prisma.lead.deleteMany({ where: { accountId } });
        await prisma.property.deleteMany({ where: { accountId } });
        await prisma.document.deleteMany({ where: { accountId } });
        await prisma.message.deleteMany({ where: { accountId } });
        await prisma.consent.deleteMany({ where: { accountId } });
        await prisma.dNCList.deleteMany({ where: { accountId } });
        await prisma.jurisdictionPolicy.deleteMany({ where: { accountId } });
        await prisma.timelineEvent.deleteMany({
          where: { tenantId: accountId },
        });
        await prisma.auditLog.deleteMany({ where: { accountId } });
        await prisma.controlPlane.deleteMany({ where: { accountId } });
      }
      await moduleRef?.close();
    });

    beforeEach(() => {
      queue.enqueueCommunication.mockClear();
      queue.enqueueAgent.mockClear();
    });

    // ------------------------------------------------------------ fixtures

    function tenant() {
      const id = `synthetic-${randomUUID()}`;
      tenants.push(id);
      return id;
    }

    async function doc(
      accountId: string,
      title: string,
      link: { dealId?: string; buyerId?: string; leadId?: string },
      tags: string[] = [],
      category = 'contract',
    ) {
      return prisma.document.create({
        data: {
          accountId,
          category,
          title: `SYNTHETIC ${title}`,
          storageKey: `synthetic/${randomUUID()}`,
          fileName: 'synthetic.pdf',
          contentType: 'application/pdf',
          sizeBytes: 1,
          tags,
          ...link,
        },
      });
    }

    async function seedDeal(accountId: string, state = 'GA') {
      const lead = await prisma.lead.create({
        data: {
          accountId,
          status: 'qualified',
          canonicalAddress: '100 Synthetic Test St',
          canonicalCity: 'Atlanta',
          canonicalState: state,
          canonicalZip: '30310',
          canonicalOwner: 'SYNTHETIC Seller',
        },
      });
      const property = await prisma.property.create({
        data: {
          accountId,
          leadId: lead.id,
          address: '100 Synthetic Test St',
          city: 'Atlanta',
          state,
          zip: '30310',
        },
      });
      return prisma.deal.create({
        data: {
          accountId,
          leadId: lead.id,
          propertyId: property.id,
          stage: 'negotiating',
          arv: 260_000,
          repairEstimate: 40_000,
          mao: 130_000,
          offerAmount: 120_000,
        },
      });
    }

    async function reviewedPolicy(
      accountId: string,
      state = 'GA',
      extra: Record<string, unknown> = {},
    ) {
      await policies.upsert(accountId, state, USER, {
        assignmentAllowed: 'allowed',
        licenseRequired: 'no',
        ...extra,
      });
      return policies.review(accountId, state, USER, {
        references: 'SYNTHETIC counsel memo for tests',
      });
    }

    async function executedAgreement(
      accountId: string,
      dealId: string,
      over: Record<string, unknown> = {},
    ) {
      const signed = await doc(
        accountId,
        'Executed purchase agreement',
        { dealId },
        ['signed'],
      );
      return agreements.record(accountId, dealId, USER, {
        status: 'executed',
        executedDocumentId: signed.id,
        purchasePrice: 120_000,
        earnestMoneyAmount: 1_000,
        earnestMoneyDueAt: d(3),
        closingDeadline: d(30),
        assignability: 'permitted',
        assignmentClause: 'SYNTHETIC s.14: Buyer may assign this agreement.',
        ...over,
      } as never);
    }

    async function buyer(
      accountId: string,
      name: string,
      opts: {
        consent?: boolean;
        pof?: number;
        purchasesNearby?: number;
        locations?: string[];
        status?: string;
      } = {},
    ) {
      const email = `${name.toLowerCase().replace(/\W+/g, '.')}.${randomUUID().slice(0, 6)}@synthetic.test`;
      const b = await prisma.buyer.create({
        data: {
          accountId,
          name: `SYNTHETIC ${name}`,
          source: 'manual',
          status: opts.status ?? 'active',
          preferences: {
            locations: opts.locations ?? ['Atlanta'],
            priceRange: { min: 100_000, max: 200_000 },
          },
          ...protectBuyerContact({ email }),
        },
      });
      if (opts.consent !== false) {
        await intel.recordConsent(accountId, b.id, USER, {
          channel: 'email',
          source: 'written',
          evidence: 'SYNTHETIC consent for tests',
        });
      }
      if (opts.pof) {
        const pofDoc = await doc(
          accountId,
          'Proof of funds',
          { buyerId: b.id },
          [],
          'other',
        );
        await intel.setProofOfFunds(accountId, b.id, USER, {
          status: 'verified',
          amount: opts.pof,
          documentId: pofDoc.id,
        });
      }
      for (let i = 0; i < (opts.purchasesNearby ?? 0); i++) {
        await intel.addTransaction(accountId, b.id, USER, {
          city: 'Atlanta',
          state: 'GA',
          zip: '30310',
          price: 140_000 + i * 10_000,
          closedAt: d(-60 - i * 30),
          source: 'public_record',
          sourceRef: `SYNTHETIC-RECORD-${i}`,
        });
      }
      return { ...b, email };
    }

    /** Executed, verified, policy reviewed: the deal is marketed. */
    async function marketableDeal(accountId: string) {
      const deal = await seedDeal(accountId);
      await reviewedPolicy(accountId);
      await executedAgreement(accountId, deal.id);
      const verified = await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect(verified.stageChanged).toBe('marketing');
      return deal;
    }

    async function tokenFromOutreach(
      accountId: string,
      dealId: string,
      buyerId: string,
    ) {
      const msg = await prisma.message.findFirst({
        where: {
          accountId,
          dealId,
          metadata: { path: ['buyerId'], equals: buyerId },
        },
        orderBy: { createdAt: 'desc' },
      });
      const m = /\/p\/deals\/([A-Za-z0-9_-]+)/.exec(msg?.content ?? '');
      if (!m) throw new Error('no deal link in the outreach');
      return m[1];
    }

    async function launchedCampaign(accountId: string, dealId: string) {
      const prepared = await campaigns.prepare(accountId, dealId, USER, {
        maxBuyers: 25,
      });
      const launch = await campaigns.approveAndLaunch(
        accountId,
        prepared.campaign.id,
        USER,
      );
      expect(launch.launched).toBe(true);
      return launch.campaign;
    }

    // -------------------------------------------------------------- tests

    it('flips a contract: verified agreement, ranked buyers, campaign, offer, assignment, closing, fee', async () => {
      const accountId = tenant();
      const deal = await seedDeal(accountId);

      // Executed but not verified, and no GA policy: held for review.
      await executedAgreement(accountId, deal.id);
      let e = await eligibility.evaluate(accountId, deal.id);
      expect(e.status).toBe('review_required');
      expect(
        e.checks.filter((c) => c.status === 'review').map((c) => c.key),
      ).toEqual(
        expect.arrayContaining(['terms_verified', 'jurisdiction_policy']),
      );
      expect(
        (await prisma.deal.findUnique({ where: { id: deal.id } }))?.stage,
      ).toBe('under_contract');
      expect(
        await prisma.closingFile.count({ where: { dealId: deal.id } }),
      ).toBe(1);

      // Verifying alone is not enough while the state is unreviewed.
      const first = await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect(first.stageChanged).toBeNull();
      await reviewedPolicy(accountId);
      e = await eligibility.evaluate(accountId, deal.id);
      expect(e.status).toBe('eligible');
      await deals.updateStage(deal.id, accountId, 'marketing', USER);
      expect(queue.enqueueAgent).toHaveBeenCalledWith(
        expect.objectContaining({ agent: 'disposition_matcher' }),
      );

      // Buyers: one proven, one without consent, one opted out, one inactive.
      const proven = await buyer(accountId, 'Proven Buyer', {
        pof: 300_000,
        purchasesNearby: 2,
      });
      const noConsent = await buyer(accountId, 'No Consent Buyer', {
        consent: false,
      });
      const optedOut = await buyer(accountId, 'Opted Out Buyer');
      await optOut.recordEmailOptOut({
        accountId,
        email: optedOut.email,
        source: 'synthetic',
        reason: 'test',
      });
      await buyer(accountId, 'Inactive Buyer', { status: 'inactive' });

      const ranked = await intel.rankForDeal(accountId, deal.id);
      expect(ranked.matches[0].buyerId).toBe(proven.id);
      expect(
        ranked.matches.find((m) => m.buyerId === noConsent.id)?.contactable,
      ).toBe(false);
      expect(
        ranked.matches
          .find((m) => m.buyerId === optedOut.id)
          ?.excludedReasons.join(),
      ).toContain('opted out');

      // Campaign: priced from the contract, only contactable buyers selected.
      const prepared = await campaigns.prepare(accountId, deal.id, USER, {
        maxBuyers: 25,
      });
      expect(prepared.campaign.targets.map((t) => t.buyerId)).toEqual([
        proven.id,
      ]);
      expect(prepared.pricing.floorPrice).toBe(125_000);
      expect(prepared.campaign.askingPrice).toBe(130_000);
      // No seller-side figure (contract price, offer to the seller) reaches the buyer package.
      expect(numbersIn(prepared.campaign.package?.content)).not.toContain(
        120_000,
      );
      const launch = await campaigns.approveAndLaunch(
        accountId,
        prepared.campaign.id,
        USER,
      );
      expect(launch.launched).toBe(true);
      expect(launch.results).toEqual([
        expect.objectContaining({ buyerId: proven.id, status: 'approved' }),
      ]);
      expect(queue.enqueueCommunication).toHaveBeenCalledTimes(1);

      // The buyer opens their link and offers.
      const token = await tokenFromOutreach(accountId, deal.id, proven.id);
      const view = await pages.view(token);
      expect(view.package.price.askingPrice).toBe(130_000);
      expect(view.package.rightsOffered).toContain('not the owner');
      const response = await pages.respond(
        token,
        { intent: 'offer', amount: 136_000, acknowledgedDisclosures: true },
        { ip: '127.0.0.1' },
      );
      expect(response.recorded).toBe('offer');

      const list = await offers.list(accountId, deal.id);
      expect(list.offers[0]).toMatchObject({
        amount: 136_000,
        capturedBy: 'buyer',
        status: 'received',
      });
      expect(list.offers[0].recommendation?.recommendation).toBe('accept');

      // Accepted by a person: an assignment draft at that price.
      const accepted = await offers.accept(
        accountId,
        response.offerId as string,
        USER,
        { structure: 'assignment' },
      );
      expect(accepted.assignment).toMatchObject({
        assignmentPrice: 136_000,
        assignmentFee: 16_000,
        status: 'draft',
      });
      expect(
        (
          await prisma.dispositionCampaign.findFirst({
            where: { dealId: deal.id },
          })
        )?.status,
      ).toBe('paused');

      const executedCopy = await doc(
        accountId,
        'Executed assignment',
        { dealId: deal.id },
        ['signed'],
      );
      await assignments.markExecuted(accountId, accepted.assignment.id, USER, {
        executedDocumentId: executedCopy.id,
      });
      expect(
        (await prisma.deal.findUnique({ where: { id: deal.id } }))?.stage,
      ).toBe('assigned');

      // Closing cannot be confirmed while milestones are pending.
      const settlement = await doc(
        accountId,
        'Settlement statement',
        { dealId: deal.id },
        [],
        'closing',
      );
      await expect(
        closing.confirmClosing(accountId, deal.id, USER, {
          closedAt: new Date(),
          settlementDocumentId: settlement.id,
          feeOnStatement: 16_000,
        }),
      ).rejects.toThrow('not clear to close');

      const file = await closing.get(accountId, deal.id);
      for (const m of file!.milestones.filter((x) => x.status === 'pending')) {
        await closing.setMilestone(accountId, deal.id, m.key, USER, {
          status: 'done',
        });
      }
      expect((await closing.get(accountId, deal.id))?.status).toBe(
        'clear_to_close',
      );

      await closing.confirmClosing(accountId, deal.id, USER, {
        closedAt: new Date(),
        settlementDocumentId: settlement.id,
        feeOnStatement: 16_000,
      });
      expect(
        (await prisma.deal.findUnique({ where: { id: deal.id } }))?.stage,
      ).toBe('closed');
      // Default rule: revenue only once the money is received.
      let econ = await prisma.dealEconomics.findUnique({
        where: { dealId: deal.id },
      });
      expect(econ).toMatchObject({
        revenueStatus: 'projected',
        realizedFee: null,
      });
      let portfolio = await center.portfolio(accountId);
      expect(portfolio.money.realized.assignmentFees).toBe(0);
      expect(portfolio.money.closedAwaitingFunds.amount).toBe(16_000);

      await closing.recordFeeReceived(accountId, deal.id, USER, {
        amount: 16_000,
        receivedAt: new Date(),
      });
      econ = await prisma.dealEconomics.findUnique({
        where: { dealId: deal.id },
      });
      expect(econ).toMatchObject({
        revenueStatus: 'realized',
        realizedFee: 16_000,
      });
      portfolio = await center.portfolio(accountId);
      expect(portfolio.money.realized).toMatchObject({
        assignmentFees: 16_000,
        deals: 1,
      });
      expect(portfolio.pipeline.closed).toBe(1);

      // The closing becomes evidence for the buyer's next ranking.
      const tx = await prisma.buyerTransaction.findFirst({
        where: { buyerId: proven.id, source: 'halo_closing' },
      });
      expect(tx).toMatchObject({ dealId: deal.id, price: 136_000 });
      const timeline = await prisma.timelineEvent.findMany({
        where: { tenantId: accountId, entityId: deal.id },
      });
      expect(timeline.map((t) => t.eventType)).toEqual(
        expect.arrayContaining([
          'PURCHASE_AGREEMENT_RECORDED',
          'CLOSING_FILE_OPENED',
          'PURCHASE_AGREEMENT_VERIFIED',
          'DEAL_PACKAGE_APPROVED',
          'CAMPAIGN_LAUNCHED',
          'BUYER_OFFER_RECEIVED',
          'BUYER_OFFER_ACCEPTED',
          'ASSIGNMENT_EXECUTED',
          'CLOSING_CONFIRMED',
          'ASSIGNMENT_FEE_RECEIVED',
        ]),
      );
    });

    it('holds a contract that prohibits assignment out of marketing', async () => {
      const accountId = tenant();
      const deal = await seedDeal(accountId);
      await reviewedPolicy(accountId);
      await executedAgreement(accountId, deal.id, {
        assignability: 'prohibited',
      });
      const verified = await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect(verified.stageChanged).toBeNull();
      expect(verified.eligibility.status).toBe('blocked');
      await expect(
        deals.updateStage(deal.id, accountId, 'marketing', USER),
      ).rejects.toThrow('Contract may be assigned');
      const prepared = await campaigns.prepare(accountId, deal.id, USER, {
        maxBuyers: 5,
      });
      await expect(
        campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
      ).rejects.toThrow('prohibits assignment');
    });

    it('refuses to verify an agreement whose assignment clause nobody read', async () => {
      const accountId = tenant();
      const deal = await seedDeal(accountId);
      await executedAgreement(accountId, deal.id, { assignability: 'unknown' });
      await expect(
        agreements.verify(accountId, deal.id, USER, {
          confirmations: ALL_CONFIRMED,
        }),
      ).rejects.toThrow('assignment clause');
    });

    it('blocks disposition on a title blocker until it is resolved', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      await buyer(accountId, 'Title Test Buyer', { pof: 300_000 });
      const issue = await closing.raiseIssue(accountId, deal.id, USER, {
        kind: 'title',
        severity: 'blocking',
        description: 'SYNTHETIC unreleased mortgage lien',
      });
      expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
        'blocked',
      );
      const prepared = await campaigns.prepare(accountId, deal.id, USER, {
        maxBuyers: 5,
      });
      await expect(
        campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
      ).rejects.toThrow('unreleased mortgage lien');
      await expect(
        closing.setMilestone(accountId, deal.id, 'title_clear', USER, {
          status: 'done',
        }),
      ).rejects.toThrow('blocking title issue');
      await closing.resolveIssue(
        accountId,
        issue.id,
        USER,
        'SYNTHETIC payoff letter recorded',
      );
      expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
        'eligible',
      );
      const launch = await campaigns.approveAndLaunch(
        accountId,
        prepared.campaign.id,
        USER,
      );
      expect(launch.launched).toBe(true);
    });

    it('rejects a lowball offer and never lets it be accepted afterwards', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const b = await buyer(accountId, 'Lowball Buyer', { pof: 300_000 });
      const offer = await offers.record(accountId, deal.id, USER, {
        buyerId: b.id,
        amount: 110_000,
        kind: 'written_offer',
        source: 'phone',
      });
      const list = await offers.list(accountId, deal.id);
      expect(list.offers[0].recommendation?.recommendation).toBe('reject');
      await offers.reject(accountId, offer.id, USER, {
        reason: 'below floor',
        notifyBuyer: false,
      });
      await expect(
        offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
      ).rejects.toThrow('rejected');
    });

    it('refuses an unqualified buyer: no verified proof of funds', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const b = await buyer(accountId, 'Unproven Buyer');
      const offer = await offers.record(accountId, deal.id, USER, {
        buyerId: b.id,
        amount: 140_000,
        kind: 'written_offer',
        source: 'email',
      });
      await expect(
        offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'UNQUALIFIED_BUYER' }),
      });
      // Proof of funds that does not cover the price is no better.
      const small = await doc(
        accountId,
        'Proof of funds',
        { buyerId: b.id },
        [],
        'other',
      );
      await intel.setProofOfFunds(accountId, b.id, USER, {
        status: 'verified',
        amount: 50_000,
        documentId: small.id,
      });
      await expect(
        offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
      ).rejects.toThrow('do not cover');
      expect(
        await prisma.assignmentAgreement.count({ where: { dealId: deal.id } }),
      ).toBe(0);
    });

    it('needs a reason to accept below the minimum profit, and confirmation of an agent-read amount', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const b = await buyer(accountId, 'Thin Margin Buyer', { pof: 300_000 });
      const run = await prisma.automationRun.create({
        data: { tenantId: accountId, agentName: 'buyer_responder' },
      });
      const offer = await offers.recordFromAgent(accountId, deal.id, {
        buyerId: b.id,
        amount: 123_000,
        kind: 'written_offer',
        source: 'email',
        confidence: 0.82,
        automationRunId: run.id,
      });
      await expect(
        offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
      ).rejects.toThrow('confirm it first');
      await offers.confirm(accountId, offer.id, USER);
      await expect(
        offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'BELOW_MINIMUM_PROFIT' }),
      });
      await expect(
        offers.accept(accountId, offer.id, USER, {
          structure: 'double_close',
          belowMinimumReason: 'SYNTHETIC reason',
        }),
      ).rejects.toThrow('double close');
      const ok = await offers.accept(accountId, offer.id, USER, {
        structure: 'assignment',
        belowMinimumReason: 'SYNTHETIC: seller deadline',
      });
      expect(ok.assignment.assignmentFee).toBe(3_000);
      await prisma.automationRun.delete({ where: { id: run.id } });
    });

    it('stops marketing an expired contract: links go dead and the campaign expires', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const b = await buyer(accountId, 'Late Buyer', { pof: 300_000 });
      await launchedCampaign(accountId, deal.id);
      const token = await tokenFromOutreach(accountId, deal.id, b.id);
      await expect(pages.view(token)).resolves.toBeTruthy();

      // Time passes: the deadline is behind us.
      await prisma.purchaseAgreement.updateMany({
        where: { dealId: deal.id },
        data: { closingDeadline: d(-1) },
      });
      const e = await eligibility.evaluate(accountId, deal.id);
      expect(e.status).toBe('blocked');
      expect(e.checks.find((c) => c.key === 'contract_live')?.status).toBe(
        'fail',
      );
      await expect(pages.view(token)).rejects.toThrow('no longer available');
      expect(await campaigns.expireCampaigns()).toBeGreaterThanOrEqual(1);
      const c = await prisma.dispositionCampaign.findFirst({
        where: { dealId: deal.id },
      });
      expect(c).toMatchObject({
        status: 'expired',
        endedReason: 'seller contract no longer in force',
      });
      expect(
        await prisma.dealShareLink.count({
          where: { dealId: deal.id, revokedAt: null },
        }),
      ).toBe(0);
      const offer = await offers
        .record(accountId, deal.id, USER, {
          buyerId: b.id,
          amount: 140_000,
          kind: 'written_offer',
          source: 'email',
        })
        .catch((err) => err);
      // An offer is still recorded (it is a fact) but cannot be accepted.
      if (!(offer instanceof Error)) {
        await expect(
          offers.accept(accountId, offer.id, USER, { structure: 'assignment' }),
        ).rejects.toThrow('has passed');
      }
    });

    it('cancels an assignment when the buyer walks, re-markets, and remembers it against them', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const walker = await buyer(accountId, 'Walking Buyer', { pof: 300_000 });
      await launchedCampaign(accountId, deal.id);
      const offer = await offers.record(accountId, deal.id, USER, {
        buyerId: walker.id,
        amount: 135_000,
        kind: 'written_offer',
        source: 'email',
      });
      const { assignment } = await offers.accept(accountId, offer.id, USER, {
        structure: 'assignment',
      });

      const cancelled = await assignments.cancel(
        accountId,
        assignment.id,
        USER,
        { cause: 'buyer_default', reason: 'SYNTHETIC: failed to fund' },
      );
      expect(cancelled.remarketed).toBe(true);
      expect((await offers.get(accountId, offer.id)).status).toBe('withdrawn');
      expect(
        (
          await prisma.dispositionCampaign.findFirst({
            where: { dealId: deal.id },
          })
        )?.status,
      ).toBe('active');
      const [ranked] = await intel.rankingBuyers(accountId, [walker.id]);
      expect(ranked.outcomes.fellThrough).toBe(1);

      // Then the whole deal dies: closing cancelled, deal lost, projection lost.
      await closing.cancelClosing(accountId, deal.id, USER, {
        reason: 'SYNTHETIC: seller backed out',
        markDealLost: true,
      });
      expect(
        (await prisma.deal.findUnique({ where: { id: deal.id } }))?.stage,
      ).toBe('lost');
      expect(
        (
          await prisma.dispositionCampaign.findFirst({
            where: { dealId: deal.id },
          })
        )?.status,
      ).toBe('cancelled');
      expect(
        await prisma.dealShareLink.count({
          where: { dealId: deal.id, revokedAt: null },
        }),
      ).toBe(0);
      const portfolio = await center.portfolio(accountId);
      expect(portfolio.failures).toMatchObject({
        assignmentsCancelled: 1,
        buyerDefaults: 1,
        closingsCancelled: 1,
      });
    });

    it('requires the Texas equitable-interest notice before a Texas deal is marketed', async () => {
      const accountId = tenant();
      const deal = await seedDeal(accountId, 'TX');
      await reviewedPolicy(accountId, 'TX');
      await executedAgreement(accountId, deal.id);
      const verified = await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect(verified.stageChanged).toBeNull();
      expect(
        verified.eligibility.checks.find((c) => c.key === 'buyer_disclosures'),
      ).toMatchObject({ status: 'fail' });
      await doc(
        accountId,
        'Equitable interest notice',
        { dealId: deal.id },
        ['checklist:equitable_interest_disclosure'],
        'disclosure',
      );
      expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
        'eligible',
      );
    });

    it('keeps seller-side figures out of the package even when a person types them in', async () => {
      const accountId = tenant();
      const deal = await marketableDeal(accountId);
      const pkg = await packages.createDraft(accountId, deal.id, USER, 131_000);
      await expect(
        packages.updateDraft(accountId, pkg.id, USER, {
          description: 'We got this under contract for $120,000!',
        }),
      ).rejects.toThrow('seller-side figure');
    });

    it('underwrites deterministically and ranks early-stage opportunities on real facts', async () => {
      const accountId = tenant();
      const strong = await seedDeal(accountId);
      const weak = await seedDeal(accountId);
      await prisma.lead.update({
        where: { id: strong.leadId! },
        data: { score: 85 },
      });
      await prisma.lead.update({
        where: { id: weak.leadId! },
        data: { score: 30 },
      });
      await prisma.underwritingResult.create({
        data: { dealId: strong.id, confidence: 0.8 },
      });
      // The weak deal's numbers do not work: repairs eat the spread.
      await prisma.deal.update({
        where: { id: weak.id },
        data: { repairEstimate: 180_000 },
      });
      await buyer(accountId, 'Demand Buyer A', {
        pof: 300_000,
        purchasesNearby: 2,
      });
      await buyer(accountId, 'Demand Buyer B', { purchasesNearby: 1 });

      const u = await offers.underwriting(accountId, strong.id);
      // 260k x 0.70 - 40k repairs = 142k for an investor; less the 10k fee = 132k.
      expect(u).toMatchObject({
        investorMax: 142_000,
        mao: 132_000,
        recommendation: 'offer',
      });
      expect(u.offerRange).toEqual({ low: 112_000, high: 132_000 });
      expect(
        (await offers.underwriting(accountId, weak.id)).recommendation,
      ).toBe('pass');

      const ranked = await center.opportunities(accountId);
      expect(ranked.map((r) => r.id)).toEqual([strong.id, weak.id]);
      expect(ranked[0].components.margin).toBeGreaterThan(0);
      expect(ranked[0].components.demand).toBeGreaterThan(0);
      expect(ranked[1].reasons).toContain('Underwriting says pass');
    });

    it('fills only a reviewed template, only from recorded terms, and refuses a missing value', async () => {
      const accountId = tenant();
      process.env.HALO_CONTRACTING_ENTITY = 'SYNTHETIC Acquisitions LLC';
      const deal = await seedDeal(accountId);
      const wording =
        'SYNTHETIC PURCHASE AGREEMENT\nSeller {{seller_name}} sells to {{buyer_entity}} the property at {{property_address}}, ' +
        '{{property_city}}, {{property_state}} for {{purchase_price}}. Earnest money {{earnest_money}} due {{earnest_money_due}}. ' +
        'Close by {{closing_deadline}}. Buyer may assign this agreement.\n[SELLER_SIGNATURE]';
      const key = `${accountId}/documents/template.txt`;
      objects.set(key, Buffer.from(wording));
      const template = await prisma.document.create({
        data: {
          accountId,
          category: 'agreement_template',
          title: 'SYNTHETIC GA purchase agreement',
          storageKey: key,
          fileName: 'template.txt',
          contentType: 'text/plain',
          sizeBytes: wording.length,
          jurisdiction: 'GA',
          tags: [],
        },
      });

      // Not reviewed yet: nothing to fill from.
      await agreements.record(accountId, deal.id, USER, {
        status: 'draft',
        purchasePrice: 120_000,
        earnestMoneyAmount: 1_000,
        closingDeadline: new Date('2026-11-20T12:00:00Z'),
        assignability: 'permitted',
      } as never);
      await expect(
        drafting.generate(accountId, deal.id, USER, {
          kind: 'purchase_agreement',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NO_REVIEWED_TEMPLATE' }),
      });

      await drafting.reviewTemplate(accountId, template.id, USER, {
        kind: 'purchase_agreement',
      });
      // Reviewed, but the earnest money due date is not on the record.
      await expect(
        drafting.generate(accountId, deal.id, USER, {
          kind: 'purchase_agreement',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TEMPLATE_INCOMPLETE',
          missing: ['earnest_money_due'],
        }),
      });

      await agreements.update(accountId, deal.id, USER, {
        earnestMoneyDueAt: new Date('2026-10-24T12:00:00Z'),
      });
      const out = await drafting.generate(accountId, deal.id, USER, {
        kind: 'purchase_agreement',
      });
      const doc = await prisma.document.findUnique({
        where: { id: out.documentId },
      });
      expect(doc).toMatchObject({
        dealId: deal.id,
        category: 'contract',
        contentType: 'text/plain',
      });
      const text = objects.get(doc!.storageKey)!.toString('utf8');
      expect(text).toContain(
        'Seller SYNTHETIC Seller sells to SYNTHETIC Acquisitions LLC',
      );
      expect(text).toContain(
        'for $120,000.00. Earnest money $1,000.00 due October 24, 2026. Close by November 20, 2026.',
      );
      expect(text).toContain('[SELLER_SIGNATURE]');
      expect(text).not.toMatch(/\{\{/);

      // A template asking for a field Halo does not know cannot be reviewed.
      const badKey = `${accountId}/documents/bad.txt`;
      objects.set(badKey, Buffer.from('Seller SSN: {{seller_ssn}}'));
      const bad = await prisma.document.create({
        data: {
          accountId,
          category: 'agreement_template',
          title: 'bad',
          storageKey: badKey,
          fileName: 'bad.txt',
          contentType: 'text/plain',
          sizeBytes: 1,
          tags: [],
        },
      });
      await expect(
        drafting.reviewTemplate(accountId, bad.id, USER, {
          kind: 'purchase_agreement',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'TEMPLATE_UNKNOWN_FIELDS' }),
      });
    });

    it('puts what needs a person at the top of the attention list', async () => {
      const accountId = tenant();
      const deal = await seedDeal(accountId);
      await executedAgreement(accountId, deal.id);
      const items = await center.attention(accountId);
      expect(items[0]).toMatchObject({
        dealId: deal.id,
        kind: 'verify_agreement',
      });
      const ws = await center.workspace(accountId, deal.id, null);
      expect(ws.nextActions[0].kind).toBe('verify_agreement');
      expect(ws.eligibility.status).toBe('review_required');
    });
  },
);
