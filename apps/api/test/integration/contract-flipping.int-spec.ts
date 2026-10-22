/**
 * The contract-flipping lifecycle against a real Postgres
 * (docs/contract-flipping.md s9, docs/markets.md s9). Every service is the
 * real one; only the BullMQ queue (nothing is ever sent), object storage
 * (in memory) and the HTTP auth guards are stubbed.
 *
 * Every record here is a SYNTHETIC fixture on its own throwaway tenant:
 * no real buyer, seller, property, offer, fee, policy or template. Run
 * against a scratch database only:
 *
 *   INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
 *
 * Without INTEGRATION_DATABASE_URL the suite is skipped.
 */
import { randomUUID } from 'crypto';
import type { TestingModule } from '@nestjs/testing';
import {
  ALL_CONFIRMED,
  USER,
  buildModule,
  d,
  describeDb,
  fixtures,
  objects,
  queue,
  synthMarketContent,
} from './harness';
import { PrismaService } from '../../src/prisma.service';
import { DealsService } from '../../src/deals/deals.service';
import { PurchaseAgreementsService } from '../../src/disposition/purchase-agreements.service';
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
import { TaxSalesService } from '../../src/disposition/tax-sales.service';
import { MarketsService } from '../../src/markets/markets.service';
import { TemplatesService } from '../../src/templates/templates.service';
import { buildDocx } from '../../src/templates/template-files';

describeDb(
  'contract flipping, end to end (synthetic fixtures, real database)',
  () => {
    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let deals: DealsService;
    let agreements: PurchaseAgreementsService;
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
    let markets: MarketsService;
    let templates: TemplatesService;
    let fx: ReturnType<typeof fixtures>;

    beforeAll(async () => {
      moduleRef = await buildModule();
      fx = fixtures(moduleRef);
      prisma = moduleRef.get(PrismaService);
      deals = moduleRef.get(DealsService);
      agreements = moduleRef.get(PurchaseAgreementsService);
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
      markets = moduleRef.get(MarketsService);
      templates = moduleRef.get(TemplatesService);
    });

    afterAll(async () => {
      if (!prisma) return;
      // Best-effort cleanup of every synthetic tenant (cascades remove children).
      await fx.cleanup();
      await moduleRef?.close();
    });

    beforeEach(() => {
      queue.enqueueCommunication.mockClear();
      queue.enqueueAgent.mockClear();
    });

    // ------------------------------------------------------------ fixtures

    const tenant = () => fx.tenant();
    const doc = (...args: Parameters<ReturnType<typeof fixtures>['doc']>) =>
      fx.doc(...args);
    const seedDeal = (accountId: string, state = 'GA') =>
      fx.seedDeal(accountId, state);
    /** GA (or another state) approved by counsel, with templates, for disposition. */
    const approvedMarket = (
      ...args: Parameters<ReturnType<typeof fixtures>['approvedMarket']>
    ) => fx.approvedMarket(...args);

    /** A SYNTHETIC Texas policy: the buyer notice the built-in Texas gate also requires. */
    const TX_CONTENT = synthMarketContent((c) => {
      c.answers.disclosures_required = {
        answer: 'yes',
        note: 'SYNTHETIC',
        sourceIds: [],
      };
      c.disclosures = [
        {
          key: 'equitable_interest_disclosure',
          title: 'Equitable interest disclosure',
          audience: 'buyer',
          timing: 'before_marketing',
          templateKind: 'buyer_disclosure',
          sourceIds: [],
        },
      ];
    });

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

    /** Executed, verified, in an approved market: the deal is marketed. */
    async function marketableDeal(accountId: string) {
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId);
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
      const accountId = await tenant();
      const deal = await seedDeal(accountId);

      // In a research-only market, Halo may not even record a seller contract.
      await expect(executedAgreement(accountId, deal.id)).rejects.toThrow(
        'Recording a seller contract is not allowed in GA',
      );
      // Counsel approved GA; a person allowed acquisition only, for now.
      await approvedMarket(accountId, 'GA', {
        status: 'APPROVED_FOR_ACQUISITION',
      });

      // Executed but not verified, and GA not approved for disposition: held for review.
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

      // Verifying alone is not enough while the market is acquisition-only.
      const first = await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect(first.stageChanged).toBeNull();
      await markets.setStatus(accountId, 'GA', USER, {
        status: 'APPROVED_FOR_DISPOSITION',
        note: 'SYNTHETIC: disposition approved',
      });
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
      const accountId = await tenant();
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId);
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
      const accountId = await tenant();
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId);
      await executedAgreement(accountId, deal.id, { assignability: 'unknown' });
      await expect(
        agreements.verify(accountId, deal.id, USER, {
          confirmations: ALL_CONFIRMED,
        }),
      ).rejects.toThrow('assignment clause');
    });

    it('blocks disposition on a title blocker until it is resolved', async () => {
      const accountId = await tenant();
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
      const accountId = await tenant();
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
      const accountId = await tenant();
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
      const accountId = await tenant();
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
      const accountId = await tenant();
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
      const accountId = await tenant();
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
      const accountId = await tenant();
      const deal = await seedDeal(accountId, 'TX');
      await approvedMarket(accountId, 'TX', { content: TX_CONTENT });
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
      const accountId = await tenant();
      const deal = await marketableDeal(accountId);
      const pkg = await packages.createDraft(accountId, deal.id, USER, 131_000);
      await expect(
        packages.updateDraft(accountId, pkg.id, USER, {
          description: 'We got this under contract for $120,000!',
        }),
      ).rejects.toThrow('seller-side figure');
    });

    it('underwrites deterministically and ranks early-stage opportunities on real facts', async () => {
      const accountId = await tenant();
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

      // The offer to the seller stays inside the policy bounds unless a
      // person gives a reason.
      await expect(
        offers.setSellerOffer(accountId, strong.id, USER, { amount: 140_000 }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'OFFER_OUT_OF_BOUNDS' }),
      });
      await offers.setSellerOffer(accountId, strong.id, USER, {
        amount: 120_000,
      });
      expect(
        (await prisma.deal.findUnique({ where: { id: strong.id } }))
          ?.offerAmount,
      ).toBe(120_000);
      const above = await offers.setSellerOffer(accountId, strong.id, USER, {
        amount: 135_000,
        reason: 'SYNTHETIC: seller has a competing offer',
      });
      expect(above.outsidePolicy[0]).toContain('above the MAO');

      const ranked = await center.opportunities(accountId);
      expect(ranked.map((r) => r.id)).toEqual([strong.id, weak.id]);
      expect(ranked[0].components.margin).toBeGreaterThan(0);
      expect(ranked[0].components.demand).toBeGreaterThan(0);
      expect(ranked[1].reasons).toContain('Underwriting says pass');
    });

    it('generates documents only from templates counsel approved for the state, as .docx or .txt with a PDF', async () => {
      const accountId = await tenant();
      process.env.HALO_CONTRACTING_ENTITY = 'SYNTHETIC Acquisitions LLC';
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId, 'GA', {
        status: 'APPROVED_FOR_ACQUISITION',
      });
      await agreements.record(accountId, deal.id, USER, {
        status: 'draft',
        purchasePrice: 120_000,
        closingDeadline: new Date('2026-11-20T12:00:00Z'),
        assignability: 'permitted',
      } as never);

      // The approved text template asks for earnest money, which is not on the record.
      await expect(
        templates.generate(accountId, deal.id, USER, {
          kind: 'purchase_agreement',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: 'TEMPLATE_INCOMPLETE',
          missing: ['earnest_money'],
        }),
      });
      // No seller disclosure template exists for GA at all.
      await expect(
        templates.generate(accountId, deal.id, USER, {
          kind: 'seller_disclosure',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NO_APPROVED_TEMPLATE' }),
      });
      await agreements.update(accountId, deal.id, USER, {
        earnestMoneyAmount: 1_000,
      });

      // Counsel's Word version, approved for GA, takes over from the text one.
      const docx = buildDocx([
        { text: 'SYNTHETIC PURCHASE AGREEMENT', style: 'title' },
        {
          text: 'Seller {{ seller_name }} sells to {{buyer_entity}} the property at {{property_address}}, {{property_city}}, {{property_state}}.',
        },
        {
          text: 'Price {{purchase_price}}; earnest money {{earnest_money}}; close by {{closing_deadline}}.',
        },
        { text: '[SELLER_SIGNATURE]' },
      ]);
      const word = await fx.approvedTemplate(
        accountId,
        'purchase_agreement',
        ['GA'],
        { buffer: docx, fileName: 'pa.docx' },
      );
      expect(word).toMatchObject({ status: 'approved', format: 'docx' });
      const out = await templates.generate(accountId, deal.id, USER, {
        kind: 'purchase_agreement',
      });
      expect(out.templateVersionId).toBe(word.id);
      if (process.env.PDF_CONVERTER_URL) {
        // A Gotenberg is running (docs/markets.md s6): a real PDF of the
        // filled Word file, stored beside it.
        expect(out.pdfDocumentId).toBeTruthy();
        const pdfRow = await prisma.document.findUnique({
          where: { id: out.pdfDocumentId! },
        });
        expect(pdfRow).toMatchObject({ contentType: 'application/pdf' });
        const bytes = objects.get(pdfRow!.storageKey)!;
        expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
        const { PDFDocument } = await import('pdf-lib');
        expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(
          0,
        );
      } else {
        expect(out.pdfDocumentId).toBeNull();
        expect(out.pdfNote).toContain('PDF_CONVERTER_URL');
      }
      const generated = await prisma.document.findUnique({
        where: { id: out.documentId },
      });
      expect(generated).toMatchObject({
        dealId: deal.id,
        category: 'contract',
        fileName: `purchase_agreement-${deal.id}.docx`,
      });
      const PizZip = (await import('pizzip')).default;
      const body = new PizZip(objects.get(generated!.storageKey)!)
        .file('word/document.xml')!
        .asText();
      expect(body).toContain(
        'Seller SYNTHETIC Seller sells to SYNTHETIC Acquisitions LLC',
      );
      expect(body).toContain(
        'Price $120,000.00; earnest money $1,000.00; close by November 20, 2026.',
      );
      expect(body).not.toMatch(/\{\{/);
      const generation = await prisma.documentGeneration.findUnique({
        where: { id: out.generationId },
      });
      expect(generation).toMatchObject({
        templateVersionId: word.id,
        kind: 'purchase_agreement',
        state: 'GA',
        status: 'draft',
      });

      // Retire the Word version: the text one is used again, and it comes with a PDF.
      await templates.retire(accountId, word.id, USER, 'SYNTHETIC: testing');
      const txt = await templates.generate(accountId, deal.id, USER, {
        kind: 'purchase_agreement',
      });
      expect(txt.pdfDocumentId).toBeTruthy();
      const pdf = await prisma.document.findUnique({
        where: { id: txt.pdfDocumentId! },
      });
      expect(objects.get(pdf!.storageKey)!.subarray(0, 5).toString()).toBe(
        '%PDF-',
      );

      // A template asking for a field Halo does not know stays a draft and cannot be approved.
      const bad = await doc(
        accountId,
        'bad template',
        {},
        [],
        'agreement_template',
        {
          text: `{{seller_ssn}} {{seller_name}} {{buyer_entity}} {{property_address}} {{purchase_price}} {{earnest_money}} {{closing_deadline}}`,
          fileName: 'bad.txt',
        },
      );
      const created = await templates.create(accountId, USER, {
        kind: 'purchase_agreement',
        name: 'SYNTHETIC bad',
        documentId: bad.id,
        states: ['GA'],
      });
      expect(created.version).toMatchObject({
        status: 'draft',
        unknownFields: ['seller_ssn'],
      });
      const approval = await doc(accountId, 'approval', {}, [], 'compliance');
      await expect(
        templates.approve(accountId, created.version.id, USER, {
          counselName: 'SYNTHETIC Counsel',
          approvalDocumentId: approval.id,
          attest: true,
        }),
      ).rejects.toThrow('unknown field {{seller_ssn}}');

      // A file changed after upload cannot be approved.
      const ok = await doc(
        accountId,
        'ok template',
        {},
        [],
        'agreement_template',
        {
          text: '{{seller_name}} {{buyer_entity}} {{property_address}} {{purchase_price}} {{earnest_money}} {{closing_deadline}}',
          fileName: 'ok.txt',
        },
      );
      const fresh = await templates.create(accountId, USER, {
        kind: 'purchase_agreement',
        name: 'SYNTHETIC tampered',
        documentId: ok.id,
        states: ['GA'],
      });
      expect(fresh.version.status).toBe('validated');
      objects.set(ok.storageKey, Buffer.from('{{seller_name}} edited'));
      await expect(
        templates.approve(accountId, fresh.version.id, USER, {
          counselName: 'SYNTHETIC Counsel',
          approvalDocumentId: approval.id,
          attest: true,
        }),
      ).rejects.toThrow('changed after it was uploaded');

      // Starter scaffolds install for every kind, apply nowhere, and cannot be approved.
      const starters = await templates.installStarters(accountId, USER);
      expect(starters.installed).toHaveLength(5);
      const scaffold = await prisma.documentTemplateVersion.findFirst({
        where: {
          accountId,
          template: { name: 'Starter scaffold: purchase agreement' },
        },
      });
      expect(scaffold).toMatchObject({ status: 'validated', states: [] });
      await expect(
        templates.approve(accountId, scaffold!.id, USER, {
          counselName: 'SYNTHETIC Counsel',
          approvalDocumentId: approval.id,
          attest: true,
          states: ['GA'],
        }),
      ).rejects.toThrow('not legal text');
    });

    it('launches a campaign once and accepts one offer per deal, even when two happen at once', async () => {
      const accountId = await tenant();
      const deal = await marketableDeal(accountId);
      const a = await buyer(accountId, 'Race Buyer A', { pof: 300_000 });
      const b = await buyer(accountId, 'Race Buyer B', { pof: 300_000 });
      const prepared = await campaigns.prepare(accountId, deal.id, USER, {
        maxBuyers: 5,
      });
      const launches = await Promise.allSettled([
        campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
        campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
      ]);
      expect(launches.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(queue.enqueueCommunication).toHaveBeenCalledTimes(2);

      const oa = await offers.record(accountId, deal.id, USER, {
        buyerId: a.id,
        amount: 136_000,
        kind: 'written_offer',
        source: 'email',
      });
      const ob = await offers.record(accountId, deal.id, USER, {
        buyerId: b.id,
        amount: 135_000,
        kind: 'written_offer',
        source: 'email',
      });
      const accepts = await Promise.allSettled([
        offers.accept(accountId, oa.id, USER, { structure: 'assignment' }),
        offers.accept(accountId, ob.id, USER, { structure: 'assignment' }),
      ]);
      expect(accepts.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(
        await prisma.assignmentAgreement.count({ where: { dealId: deal.id } }),
      ).toBe(1);
      const accepted = await prisma.buyerOffer.count({
        where: { dealId: deal.id, status: 'accepted' },
      });
      expect(accepted).toBe(1);
    });

    it('holds a tax-sale deal until a deed, an ended redemption and insurable title are verified', async () => {
      const accountId = await tenant();
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId);
      await executedAgreement(accountId, deal.id);
      await agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      });
      expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
        'eligible',
      );
      // The deal leaves marketing to be reclassified for this test.
      await prisma.deal.update({
        where: { id: deal.id },
        data: { stage: 'under_contract' },
      });

      const taxSales = moduleRef.get(TaxSalesService);
      await taxSales.upsert(accountId, deal.id, USER, {
        interestType: 'tax_lien_certificate',
        county: 'SYNTHETIC County',
        advertisedPrice: 4_500,
      });
      let e = await eligibility.evaluate(accountId, deal.id);
      expect(e.status).toBe('blocked');
      expect(e.checks[0]).toMatchObject({
        key: 'tax_sale_interest',
        status: 'fail',
      });
      await expect(
        deals.updateStage(deal.id, accountId, 'marketing', USER),
      ).rejects.toThrow('not ownership');

      await taxSales.upsert(accountId, deal.id, USER, {
        interestType: 'tax_deed',
        redemptionEndsAt: d(20),
      });
      expect(
        (await eligibility.evaluate(accountId, deal.id)).checks[0].detail,
      ).toContain('can still redeem');

      const deed = await doc(
        accountId,
        'Tax deed',
        { dealId: deal.id },
        [],
        'closing',
      );
      await taxSales.upsert(accountId, deal.id, USER, {
        redemptionEndsAt: d(-5),
        titleStatus: 'insurable',
        transferable: 'yes',
        evidenceDocumentId: deed.id,
      });
      e = await eligibility.evaluate(accountId, deal.id);
      expect(e.status).toBe('review_required');
      await taxSales.verify(accountId, deal.id, USER);
      expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
        'eligible',
      );

      // Editing a verified fact clears the verification.
      await taxSales.upsert(accountId, deal.id, USER, {
        titleStatus: 'clouded',
      });
      expect((await eligibility.evaluate(accountId, deal.id)).status).not.toBe(
        'eligible',
      );
    });

    it('puts what needs a person at the top of the attention list', async () => {
      const accountId = await tenant();
      const deal = await seedDeal(accountId);
      await approvedMarket(accountId);
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
