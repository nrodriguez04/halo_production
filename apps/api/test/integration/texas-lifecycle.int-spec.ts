/**
 * One complete Texas contract flip against a real Postgres (directive
 * 2026-10-22, item 7): approved opportunity, underwriting, a purchase
 * agreement from counsel's Texas template, the executed contract and its
 * verification, buyer matching, disposition approval, permitted marketing,
 * a buyer offer, the assignment from counsel's template, closing, and the
 * realized fee in reporting.
 *
 * The Texas policy starts from the bundled research and is "approved" by a
 * SYNTHETIC counsel; the templates are SYNTHETIC text. Nothing here is
 * legal advice or a real approval, and nothing is sent: the queue is
 * stubbed and storage is in memory.
 *
 *   INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
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
} from './harness';
import { PrismaService } from '../../src/prisma.service';
import { MarketsService } from '../../src/markets/markets.service';
import { TemplatesService } from '../../src/templates/templates.service';
import { DealsService } from '../../src/deals/deals.service';
import { PurchaseAgreementsService } from '../../src/disposition/purchase-agreements.service';
import { DispositionEligibilityService } from '../../src/disposition/eligibility.service';
import { OffersService } from '../../src/disposition/offers.service';
import { BuyerIntelligenceService } from '../../src/buyers/buyer-intelligence.service';
import { CampaignsService } from '../../src/disposition/campaigns.service';
import { PublicDealPagesService } from '../../src/disposition/public-deal-pages.service';
import { AssignmentsService } from '../../src/disposition/assignments.service';
import { ClosingService } from '../../src/disposition/closing.service';
import { CommandCenterService } from '../../src/disposition/command-center.service';
import { protectBuyerContact } from '../../src/buyers/buyer-pii';

describeDb('the Texas lifecycle, end to end (synthetic, real database)', () => {
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

  it('flips a Texas contract from approved opportunity to realized fee, under the Texas policy', async () => {
    const markets = moduleRef.get(MarketsService);
    const templates = moduleRef.get(TemplatesService);
    const deals = moduleRef.get(DealsService);
    const agreements = moduleRef.get(PurchaseAgreementsService);
    const eligibility = moduleRef.get(DispositionEligibilityService);
    const offers = moduleRef.get(OffersService);
    const intel = moduleRef.get(BuyerIntelligenceService);
    const campaigns = moduleRef.get(CampaignsService);
    const pages = moduleRef.get(PublicDealPagesService);
    const assignments = moduleRef.get(AssignmentsService);
    const closing = moduleRef.get(ClosingService);
    const center = moduleRef.get(CommandCenterService);
    process.env.HALO_CONTRACTING_ENTITY = 'SYNTHETIC Acquisitions LLC';
    const accountId = fx.tenant();

    // ---------------------------------------------------- the Texas market
    // Research becomes a draft; until counsel approves it, nothing is allowed.
    await markets.importResearch(accountId, USER, { states: ['TX'] });
    const deal = await fx.seedDeal(accountId, 'TX');
    expect(
      (await markets.evaluate(accountId, 'TX'))!.evaluation.effectiveStatus,
    ).toBe('RESEARCH_ONLY');

    // SYNTHETIC counsel reviews the research draft: the licence requirement
    // does not apply when the statutory notices are given, and the buyer
    // notice goes out before any marketing.
    const draft = (await markets.detail(accountId, 'TX')).draft!;
    draft.requirements = draft.requirements.filter(
      (r) => r.kind !== 'real_estate_license',
    );
    draft.answers.license_required_for_activity = {
      answer: 'no',
      note: 'SYNTHETIC counsel: not required for a principal who gives the notices and does not broker.',
      sourceIds: draft.answers.license_required_for_activity.sourceIds,
    };
    draft.disclosures = draft.disclosures.map((x) =>
      x.audience === 'buyer' ? { ...x, timing: 'before_marketing' } : x,
    );
    await markets.updateDraft(accountId, 'TX', USER, {
      content: draft,
      classification: 'B',
    });
    await markets.submit(accountId, 'TX', USER);
    const memo = await fx.doc(
      accountId,
      'TX counsel memo',
      {},
      [],
      'compliance',
    );
    await markets.approve(accountId, 'TX', USER, {
      counselName: 'SYNTHETIC Counsel',
      counselFirm: 'SYNTHETIC LLP',
      memoDocumentId: memo.id,
      attest: true,
    });

    // Counsel's Texas templates, and the entity registration Texas requires.
    for (const kind of [
      'purchase_agreement',
      'assignment_agreement',
      'seller_disclosure',
      'buyer_disclosure',
    ] as const) {
      await fx.approvedTemplate(accountId, kind, ['TX']);
    }
    const registration = await fx.doc(
      accountId,
      'TX registration',
      {},
      [],
      'compliance',
    );
    const reg = await markets.createAuthorization(accountId, 'TX', USER, {
      kind: 'entity_registration',
      holderName: 'SYNTHETIC Acquisitions LLC',
      identifier: 'SYNTHETIC-TX-1',
      documentId: registration.id,
      expiresAt: d(365),
    });
    await markets.verifyAuthorization(accountId, reg.id, USER);
    await markets.setStatus(accountId, 'TX', USER, {
      status: 'APPROVED_FOR_ACQUISITION',
      note: 'SYNTHETIC: acquisition approved',
    });

    // ---------------------------------------------------- opportunity and offer
    // The Deal Underwriter's judgement (ARV and repairs are on the deal); Halo does the arithmetic.
    await prisma.underwritingResult.create({
      data: { dealId: deal.id, confidence: 0.8 },
    });
    const uw = await offers.underwriting(accountId, deal.id);
    expect(uw.recommendation).toBe('offer');
    expect(uw.mao).toBe(132_000);
    await offers.setSellerOffer(accountId, deal.id, USER, { amount: 120_000 });

    // ---------------------------------------------------- the purchase agreement
    await agreements.record(accountId, deal.id, USER, {
      status: 'draft',
      purchasePrice: 120_000,
      earnestMoneyAmount: 1_000,
      earnestMoneyDueAt: d(3),
      closingDeadline: d(30),
      assignability: 'permitted',
      assignmentClause: 'SYNTHETIC: Buyer may assign this agreement.',
    } as never);
    const pa = await templates.generate(accountId, deal.id, USER, {
      kind: 'purchase_agreement',
    });
    const notice = await templates.generate(accountId, deal.id, USER, {
      kind: 'seller_disclosure',
    });
    expect(
      objects
        .get(
          (await prisma.document.findUnique({ where: { id: pa.documentId } }))!
            .storageKey,
        )!
        .toString(),
    ).toContain('SYNTHETIC Seller sells to SYNTHETIC Acquisitions LLC');
    expect(pa.pdfDocumentId).toBeTruthy();

    // The seller signs both; the signed notice is filed under its checklist key.
    const signed = await fx.doc(
      accountId,
      'Executed TX purchase agreement',
      { dealId: deal.id },
      ['signed'],
    );
    await agreements.markExecuted(accountId, deal.id, USER, {
      executedDocumentId: signed.id,
    });
    let checks = await agreements.automatedChecks(accountId, deal.id);
    expect(
      checks.checks.find((c) => c.key === 'seller_disclosures'),
    ).toMatchObject({ passed: false, blocking: true });
    await expect(
      agreements.verify(accountId, deal.id, USER, {
        confirmations: ALL_CONFIRMED,
      }),
    ).rejects.toThrow('Cannot verify yet');
    expect(notice.documentId).toBeTruthy();
    await fx.doc(
      accountId,
      'Signed TX seller notice',
      { dealId: deal.id },
      ['checklist:tx_seller_disclosure_2'],
      'disclosure',
    );
    checks = await agreements.automatedChecks(accountId, deal.id);
    expect(
      checks.checks.find((c) => c.key === 'seller_disclosures'),
    ).toMatchObject({ passed: true });
    const verified = await agreements.verify(accountId, deal.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    // Verified, but Texas is approved for acquisition only.
    expect(verified.stageChanged).toBeNull();

    // ---------------------------------------------------- disposition
    await markets.setStatus(accountId, 'TX', USER, {
      status: 'APPROVED_FOR_DISPOSITION',
      note: 'SYNTHETIC: disposition approved',
    });
    let e = await eligibility.evaluate(accountId, deal.id);
    expect(e.checks.find((c) => c.key === 'buyer_disclosures')).toMatchObject({
      status: 'fail',
    });
    const buyerNotice = await templates.generate(accountId, deal.id, USER, {
      kind: 'buyer_disclosure',
    });
    await prisma.document.update({
      where: { id: buyerNotice.documentId },
      data: { tags: { push: 'checklist:equitable_interest_disclosure' } },
    });
    e = await eligibility.evaluate(accountId, deal.id);
    expect(e.status).toBe('eligible');
    await deals.updateStage(deal.id, accountId, 'marketing', USER);

    // ---------------------------------------------------- buyers and marketing
    const email = `tx.buyer.${randomUUID().slice(0, 6)}@synthetic.test`;
    const b = await prisma.buyer.create({
      data: {
        accountId,
        name: 'SYNTHETIC Texas Buyer',
        source: 'manual',
        status: 'active',
        preferences: {
          locations: ['Atlanta'],
          priceRange: { min: 100_000, max: 200_000 },
        },
        ...protectBuyerContact({ email }),
      },
    });
    await intel.recordConsent(accountId, b.id, USER, {
      channel: 'email',
      source: 'written',
      evidence: 'SYNTHETIC consent',
    });
    const pof = await fx.doc(
      accountId,
      'Proof of funds',
      { buyerId: b.id },
      [],
      'other',
    );
    await intel.setProofOfFunds(accountId, b.id, USER, {
      status: 'verified',
      amount: 300_000,
      documentId: pof.id,
    });
    const ranked = await intel.rankForDeal(accountId, deal.id);
    expect(ranked.matches[0].buyerId).toBe(b.id);

    const prepared = await campaigns.prepare(accountId, deal.id, USER, {
      maxBuyers: 10,
    });
    const launch = await campaigns.approveAndLaunch(
      accountId,
      prepared.campaign.id,
      USER,
    );
    expect(launch).toMatchObject({ launched: true });
    expect(queue.enqueueCommunication).toHaveBeenCalled();
    const msg = await prisma.message.findFirst({
      where: { accountId, dealId: deal.id },
      orderBy: { createdAt: 'desc' },
    });
    const token = /\/p\/deals\/([A-Za-z0-9_-]+)/.exec(msg!.content)![1];
    const view = await pages.view(token);
    expect(view.package.rightsOffered).toContain('not the owner');
    const offer = await pages.respond(
      token,
      { intent: 'offer', amount: 136_000, acknowledgedDisclosures: true },
      { ip: '127.0.0.1' },
    );

    // ---------------------------------------------------- assignment
    const accepted = await offers.accept(
      accountId,
      offer.offerId as string,
      USER,
      { structure: 'assignment' },
    );
    const assignmentDoc = await templates.generate(accountId, deal.id, USER, {
      kind: 'assignment_agreement',
    });
    expect(
      objects
        .get(
          (await prisma.document.findUnique({
            where: { id: assignmentDoc.documentId },
          }))!.storageKey,
        )!
        .toString(),
    ).toContain(
      'Total price $136,000.00, including an assignment fee of $16,000.00.',
    );
    const signedAssignment = await fx.doc(
      accountId,
      'Executed TX assignment',
      { dealId: deal.id },
      ['signed'],
    );
    await assignments.markExecuted(accountId, accepted.assignment.id, USER, {
      executedDocumentId: signedAssignment.id,
    });

    // ---------------------------------------------------- closing and the fee
    const file = await closing.get(accountId, deal.id);
    for (const m of file!.milestones.filter((x) => x.status === 'pending')) {
      await closing.setMilestone(accountId, deal.id, m.key, USER, {
        status: 'done',
      });
    }
    const settlement = await fx.doc(
      accountId,
      'Settlement statement',
      { dealId: deal.id },
      [],
      'closing',
    );
    await closing.confirmClosing(accountId, deal.id, USER, {
      closedAt: new Date(),
      settlementDocumentId: settlement.id,
      feeOnStatement: 16_000,
    });
    await closing.recordFeeReceived(accountId, deal.id, USER, {
      amount: 16_000,
      receivedAt: new Date(),
    });
    const portfolio = await center.portfolio(accountId);
    expect(portfolio.money.realized).toMatchObject({
      assignmentFees: 16_000,
      deals: 1,
    });
    expect(
      (await prisma.deal.findUnique({ where: { id: deal.id } }))?.stage,
    ).toBe('closed');

    // The record of who approved what is there to audit.
    const audit = await prisma.auditLog.findMany({
      where: { accountId },
      select: { action: true },
    });
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'market.research.import',
        'market.policy.approve',
        'market.authorization.verify',
        'market.status.set',
        'template.version.approve',
        'template.generate',
        'deal.seller_offer',
      ]),
    );
    const generations = await prisma.documentGeneration.findMany({
      where: { accountId, dealId: deal.id },
      select: { kind: true, state: true },
    });
    expect(generations.map((g) => g.kind).sort()).toEqual([
      'assignment_agreement',
      'buyer_disclosure',
      'purchase_agreement',
      'seller_disclosure',
    ]);
    expect(generations.every((g) => g.state === 'TX')).toBe(true);
  });
});
