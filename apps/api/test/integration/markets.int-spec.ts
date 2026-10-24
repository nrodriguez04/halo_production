/**
 * Markets against a real Postgres (docs/markets.md s9): research import,
 * counsel's approval and versioning, the activation ladder, authorizations,
 * channels, cancellation windows and the self-test. SYNTHETIC fixtures on
 * throwaway tenants; nothing is sent.
 *
 *   INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
 */
import type { TestingModule } from '@nestjs/testing';
import {
  ALL_CONFIRMED,
  USER,
  buildModule,
  describeDb,
  fixtures,
  synthMarketContent,
} from './harness';
import { PrismaService } from '../../src/prisma.service';
import { MarketsService } from '../../src/markets/markets.service';
import { PurchaseAgreementsService } from '../../src/disposition/purchase-agreements.service';
import { DispositionEligibilityService } from '../../src/disposition/eligibility.service';
import { CampaignsService } from '../../src/disposition/campaigns.service';
import { TemplatesService } from '../../src/templates/templates.service';
import { MarketAgentContextService } from '../../src/data/market-agent-context.service';
import { sanitizeMarketProposal, type PolicySource } from '@halo/shared';

describeDb('markets (synthetic fixtures, real database)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let markets: MarketsService;
  let agreements: PurchaseAgreementsService;
  let eligibility: DispositionEligibilityService;
  let campaigns: CampaignsService;
  let templates: TemplatesService;
  let fx: ReturnType<typeof fixtures>;

  beforeAll(async () => {
    moduleRef = await buildModule();
    fx = fixtures(moduleRef);
    prisma = moduleRef.get(PrismaService);
    markets = moduleRef.get(MarketsService);
    agreements = moduleRef.get(PurchaseAgreementsService);
    eligibility = moduleRef.get(DispositionEligibilityService);
    campaigns = moduleRef.get(CampaignsService);
    templates = moduleRef.get(TemplatesService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await fx.cleanup();
    await moduleRef?.close();
  });

  async function executed(
    accountId: string,
    dealId: string,
    executedAt?: Date,
  ) {
    const signed = await fx.doc(
      accountId,
      'Executed purchase agreement',
      { dealId },
      ['signed'],
    );
    return agreements.record(accountId, dealId, USER, {
      status: 'executed',
      executedDocumentId: signed.id,
      executedAt,
      purchasePrice: 120_000,
      earnestMoneyAmount: 1_000,
      earnestMoneyDueAt: new Date(Date.now() + 3 * 86_400_000),
      closingDeadline: new Date(Date.now() + 30 * 86_400_000),
      assignability: 'permitted',
      assignmentClause: 'SYNTHETIC: Buyer may assign.',
    } as never);
  }

  it('imports research for all 51 jurisdictions as unreviewed drafts that permit nothing', async () => {
    const accountId = await fx.tenant();
    const out = await markets.importResearch(accountId, USER, {});
    expect(out.imported).toHaveLength(51);
    const matrix = await markets.matrix(accountId);
    expect(matrix.rows).toHaveLength(51);
    expect(matrix.kpis.research.withResearch).toBe(51);
    expect(matrix.kpis.active.count).toBe(0);
    expect(matrix.kpis.active.transactionEnabled).toBe(0);
    expect(
      matrix.rows.every((r) => r.effectiveStatus === 'RESEARCH_ONLY'),
    ).toBe(true);
    expect(matrix.rows.every((r) => r.legal.state === 'draft')).toBe(true);
    expect(
      await prisma.marketPolicyVersion.count({ where: { accountId } }),
    ).toBe(0);

    const tx = await markets.detail(accountId, 'TX');
    expect(tx.draft!.summary).toContain('Not reviewed by counsel');
    expect(tx.draft!.disclosures.map((x) => x.key)).toContain(
      'equitable_interest_disclosure',
    );
    expect(tx.draft!.sources.length).toBeGreaterThan(0);

    // A draft a person edited is not overwritten by a later import.
    await markets.updateDraft(accountId, 'TX', USER, { classification: 'B' });
    const again = await markets.importResearch(accountId, USER, {
      states: ['TX', 'GA'],
    });
    expect(again.imported).toEqual(['GA']);
    expect(again.skipped).toEqual([
      { state: 'TX', reason: 'the draft was edited by a person' },
    ]);

    // Research alone never lets Halo contract with a seller.
    const deal = await fx.seedDeal(accountId, 'TX');
    await expect(executed(accountId, deal.id)).rejects.toThrow(
      'not allowed in TX',
    );
  });

  it("approves only a complete policy with counsel's memo, and keeps every version immutable", async () => {
    const accountId = await fx.tenant();
    const content = synthMarketContent((c) => {
      c.answers.license_required_for_activity = {
        answer: 'unknown',
        note: '',
        sourceIds: [],
      };
      c.structures.double_close = {
        permission: 'conditional',
        conditions: null,
      };
    });
    await markets.updateDraft(accountId, 'AZ', USER, {
      content,
      classification: 'B',
    });
    const memo = await fx.doc(accountId, 'Counsel memo', {}, [], 'compliance');
    await expect(
      markets.approve(accountId, 'AZ', USER, {
        counselName: 'SYNTHETIC Counsel',
        memoDocumentId: memo.id,
        attest: true,
      }),
    ).rejects.toThrow('Submit the AZ draft');
    await markets.submit(accountId, 'AZ', USER);
    await expect(
      markets.approve(accountId, 'AZ', USER, {
        counselName: 'SYNTHETIC Counsel',
        memoDocumentId: 'missing',
        attest: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POLICY_NOT_APPROVABLE',
        problems: expect.arrayContaining([
          expect.stringContaining('license'),
          'double close is conditional with no conditions written',
          "counsel's memo is not in the documents library",
        ]),
      }),
    });

    // Editing returns the draft from review; fix it and approve.
    content.answers.license_required_for_activity = {
      answer: 'no',
      note: 'SYNTHETIC',
      sourceIds: [],
    };
    content.structures.double_close = {
      permission: 'conditional',
      conditions: 'SYNTHETIC: separate funding for each leg',
    };
    const edited = await markets.updateDraft(accountId, 'AZ', USER, {
      content,
    });
    expect(edited.returnedFromReview).toBe(true);
    await markets.submit(accountId, 'AZ', USER);
    const v1 = await markets.approve(accountId, 'AZ', USER, {
      counselName: 'SYNTHETIC Counsel',
      memoDocumentId: memo.id,
      attest: true,
    });
    expect(v1.legal).toMatchObject({
      state: 'approved',
      version: 1,
      counselName: 'SYNTHETIC Counsel',
    });
    expect(v1.effectiveStatus).toBe('PENDING_REQUIREMENTS');

    // The gate relies on v1 while the draft changes underneath.
    const changed = synthMarketContent((c) => {
      c.structures.assignment = { permission: 'prohibited', conditions: null };
    });
    await markets.updateDraft(accountId, 'AZ', USER, { content: changed });
    const live = await markets.evaluate(accountId, 'AZ');
    expect(live!.approved!.structures.assignment.permission).toBe('allowed');
    await markets.submit(accountId, 'AZ', USER);
    const v2 = await markets.approve(accountId, 'AZ', USER, {
      counselName: 'SYNTHETIC Counsel',
      memoDocumentId: memo.id,
      attest: true,
    });
    expect(v2.legal.version).toBe(2);
    const versions = await prisma.marketPolicyVersion.findMany({
      where: { accountId, state: 'AZ' },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((v) => [v.version, !!v.supersededAt])).toEqual([
      [1, true],
      [2, false],
    ]);
    expect(
      (
        versions[0].content as {
          structures: { assignment: { permission: string } };
        }
      ).structures.assignment.permission,
    ).toBe('allowed');
    expect(
      await prisma.auditLog.count({
        where: { accountId, action: 'market.policy.approve' },
      }),
    ).toBe(2);
  });

  it('climbs the ladder only as far as templates, authorizations, an operator and a self-test allow', async () => {
    const accountId = await fx.tenant();
    const content = synthMarketContent((c) => {
      c.requirements = [
        {
          key: 'wholesaler_registration',
          kind: 'wholesaler_registration',
          label: 'Wholesaler registration',
          appliesTo: ['seller_contracting', 'buyer_marketing'],
          sourceIds: [],
        },
      ];
    });
    await markets.updateDraft(accountId, 'TN', USER, {
      content,
      classification: 'C',
    });
    await markets.submit(accountId, 'TN', USER);
    const memo = await fx.doc(accountId, 'Counsel memo', {}, [], 'compliance');
    await markets.approve(accountId, 'TN', USER, {
      counselName: 'SYNTHETIC Counsel',
      memoDocumentId: memo.id,
      attest: true,
    });

    await expect(
      markets.setStatus(accountId, 'TN', USER, {
        status: 'APPROVED_FOR_ACQUISITION',
        note: 'SYNTHETIC try',
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'MARKET_NOT_READY',
        maxStatus: 'PENDING_REQUIREMENTS',
      }),
    });
    await expect(
      markets.setStatus(accountId, 'TN', USER, {
        status: 'PENDING_REQUIREMENTS',
        note: 'SYNTHETIC try',
      }),
    ).rejects.toThrow('not set by hand');

    await fx.approvedTemplate(accountId, 'purchase_agreement', ['TN']);
    // The registration is recorded but not yet verified: still not enough.
    const evidence = await fx.doc(
      accountId,
      'Registration certificate',
      {},
      [],
      'compliance',
    );
    const reg = await markets.createAuthorization(accountId, 'TN', USER, {
      kind: 'wholesaler_registration',
      holderName: 'SYNTHETIC Acquisitions LLC',
      identifier: 'SYNTHETIC-123',
      documentId: evidence.id,
      expiresAt: new Date(Date.now() + 365 * 86_400_000),
    });
    expect(
      (await markets.evaluate(accountId, 'TN'))!.evaluation.maxStatus,
    ).toBe('PENDING_REQUIREMENTS');
    await markets.verifyAuthorization(accountId, reg.id, USER);
    expect(
      (await markets.evaluate(accountId, 'TN'))!.evaluation.maxStatus,
    ).toBe('APPROVED_FOR_ACQUISITION');

    await markets.setStatus(accountId, 'TN', USER, {
      status: 'APPROVED_FOR_ACQUISITION',
      note: 'SYNTHETIC: acquisition approved',
    });
    await expect(
      markets.setStatus(accountId, 'TN', USER, {
        status: 'APPROVED_FOR_DISPOSITION',
        note: 'SYNTHETIC try',
      }),
    ).rejects.toThrow('assignment agreement template');
    await fx.approvedTemplate(accountId, 'assignment_agreement', ['TN']);
    await markets.setStatus(accountId, 'TN', USER, {
      status: 'APPROVED_FOR_DISPOSITION',
      note: 'SYNTHETIC: disposition approved',
    });

    await expect(
      markets.setStatus(accountId, 'TN', USER, {
        status: 'ACTIVE',
        note: 'SYNTHETIC try',
      }),
    ).rejects.toThrow('responsible for operations');
    await markets.setOperator(accountId, 'TN', USER, {
      operatorUserId: 'synthetic-operator',
      operatorName: 'SYNTHETIC Operator',
    });
    const test = await markets.selfTest(accountId, 'TN', USER);
    expect(test.passed).toBe(true);
    const active = await markets.setStatus(accountId, 'TN', USER, {
      status: 'ACTIVE',
      note: 'SYNTHETIC: go live',
    });
    expect(active.effectiveStatus).toBe('ACTIVE');
    expect(active.coverage).toMatchObject({ technical: true, active: true });

    // Changing an authorization makes the self-test stale and drops the market below active.
    await markets.updateAuthorization(accountId, reg.id, USER, {
      identifier: 'SYNTHETIC-456',
    });
    const after = await markets.evaluate(accountId, 'TN');
    expect(after!.evaluation.effectiveStatus).toBe('PENDING_REQUIREMENTS');
    expect(after!.evaluation.missing.join(' ')).toContain(
      'Wholesaler registration',
    );
  });

  it('restricts a market at once: campaigns pause and new seller contracts are refused', async () => {
    const accountId = await fx.tenant();
    await fx.approvedMarket(accountId, 'GA');
    const deal = await fx.seedDeal(accountId, 'GA');
    await executed(accountId, deal.id);
    await agreements.verify(accountId, deal.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    const campaign = await prisma.dispositionCampaign.create({
      data: {
        accountId,
        dealId: deal.id,
        status: 'active',
        askingPrice: 130_000,
        floorPrice: 125_000,
        approvedAt: new Date(),
        outreachSubject: 'SYNTHETIC',
        outreachBody: 'SYNTHETIC {{link}}',
      },
    });
    const restricted = await markets.setStatus(accountId, 'GA', USER, {
      status: 'RESTRICTED',
      note: 'SYNTHETIC: counsel flagged a change',
    });
    expect(restricted.pausedCampaigns).toBe(1);
    expect(
      (await prisma.dispositionCampaign.findUnique({
        where: { id: campaign.id },
      }))!.status,
    ).toBe('paused');
    expect((await eligibility.evaluate(accountId, deal.id)).status).toBe(
      'blocked',
    );
    const other = await fx.seedDeal(accountId, 'GA');
    await expect(executed(accountId, other.id)).rejects.toThrow('Restricted');
  });

  it('holds marketing until the seller cancellation window closes, counted in business days', async () => {
    const accountId = await fx.tenant();
    const content = synthMarketContent((c) => {
      c.answers.seller_cancellation_right = {
        answer: 'yes',
        note: 'SYNTHETIC',
        sourceIds: [],
      };
      c.deadlines = [
        {
          key: 'seller_cancellation',
          label: 'Seller may cancel',
          trigger: 'seller_signed',
          days: 3,
          businessDays: true,
          effect: 'seller_may_cancel',
          blocksMarketing: true,
          sourceIds: [],
        },
      ];
    });
    await fx.approvedMarket(accountId, 'OR', { content, classification: 'B' });
    const fresh = await fx.seedDeal(accountId, 'OR');
    await executed(accountId, fresh.id, new Date());
    await agreements.verify(accountId, fresh.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    const held = await eligibility.evaluate(accountId, fresh.id);
    expect(
      held.checks.find((c) => c.key === 'cancellation_period'),
    ).toMatchObject({ status: 'fail' });

    const old = await fx.seedDeal(accountId, 'OR');
    await executed(accountId, old.id, new Date(Date.now() - 10 * 86_400_000));
    await agreements.verify(accountId, old.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    const clear = await eligibility.evaluate(accountId, old.id);
    expect(
      clear.checks.find((c) => c.key === 'cancellation_period'),
    ).toMatchObject({ status: 'pass' });
    expect(clear.status).toBe('eligible');
  });

  it('launches a campaign only on channels the approved policy permits', async () => {
    const accountId = await fx.tenant();
    const content = synthMarketContent((c) => {
      c.channels.investor_email = {
        permission: 'prohibited',
        conditions: null,
      };
      c.channels.investor_phone = { permission: 'allowed', conditions: null };
    });
    await fx.approvedMarket(accountId, 'NC', { content, classification: 'D' });
    const deal = await fx.seedDeal(accountId, 'NC');
    await executed(accountId, deal.id);
    await agreements.verify(accountId, deal.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    const prepared = await campaigns.prepare(accountId, deal.id, USER, {
      maxBuyers: 5,
    });
    await expect(
      campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
    ).rejects.toThrow('does not permit investor email');
  });

  it('launches no campaign while marketing email is off, even in an approved market', async () => {
    const accountId = await fx.tenant();
    await prisma.controlPlane.update({
      where: { accountId },
      data: { marketingEmailEnabled: false },
    });
    await fx.approvedMarket(accountId, 'GA');
    const deal = await fx.seedDeal(accountId, 'GA');
    await executed(accountId, deal.id);
    await agreements.verify(accountId, deal.id, USER, {
      confirmations: ALL_CONFIRMED,
    });
    const prepared = await campaigns.prepare(accountId, deal.id, USER, {
      maxBuyers: 5,
    });
    await expect(
      campaigns.approveAndLaunch(accountId, prepared.campaign.id, USER),
    ).rejects.toThrow('Marketing email is switched off');
  });

  it('falls back to legal review when the approval lapses, and keeps an E market to research', async () => {
    const accountId = await fx.tenant();
    await fx.approvedMarket(accountId, 'GA');
    const v = await prisma.marketPolicyVersion.findFirst({
      where: { accountId, state: 'GA' },
    });
    await prisma.marketPolicyVersion.update({
      where: { id: v!.id },
      data: { reviewExpiresAt: new Date(Date.now() - 86_400_000) },
    });
    const lapsed = await markets.evaluate(accountId, 'GA');
    expect(lapsed!.evaluation.legal.state).toBe('expired');
    expect(lapsed!.evaluation.effectiveStatus).toBe('PENDING_LEGAL_REVIEW');
    expect(lapsed!.evaluation.activities.seller_contracting.allowed).toBe(
      false,
    );

    await markets.updateDraft(accountId, 'SC', USER, {
      content: synthMarketContent(),
      classification: 'E',
    });
    await markets.submit(accountId, 'SC', USER);
    const memo = await fx.doc(accountId, 'Counsel memo', {}, [], 'compliance');
    const e = await markets.approve(accountId, 'SC', USER, {
      counselName: 'SYNTHETIC Counsel',
      memoDocumentId: memo.id,
      attest: true,
    });
    expect(e.maxStatus).toBe('RESEARCH_ONLY');
    await expect(
      markets.setStatus(accountId, 'SC', USER, {
        status: 'APPROVED_FOR_ACQUISITION',
        note: 'SYNTHETIC try',
      }),
    ).rejects.toThrow('not currently authorized');
  });

  it('measures technical readiness from templates and a passing self-test, without legal approval', async () => {
    const accountId = await fx.tenant();
    await markets.importResearch(accountId, USER, { states: ['TX'] });
    let tx = await markets.selfTest(accountId, 'TX', USER);
    expect(tx.passed).toBe(false);
    expect(tx.steps.filter((s) => !s.passed).map((s) => s.name)).toEqual(
      expect.arrayContaining([
        'template:purchase_agreement',
        'template:assignment_agreement',
      ]),
    );

    // Templates uploaded and validated (not yet approved) for TX.
    for (const kind of [
      'purchase_agreement',
      'assignment_agreement',
      'buyer_disclosure',
      'seller_disclosure',
    ] as const) {
      const file = await fx.doc(
        accountId,
        `${kind} TX`,
        {},
        [],
        'agreement_template',
        {
          text: (await import('./harness')).SYNTHETIC_TEMPLATE_TEXT[kind],
          fileName: `${kind}.txt`,
        },
      );
      await templates.create(accountId, USER, {
        kind,
        name: `SYNTHETIC TX ${kind}`,
        documentId: file.id,
        states: ['TX'],
      });
    }
    tx = await markets.selfTest(accountId, 'TX', USER);
    expect(
      tx.steps.find((s) => s.name === 'template:purchase_agreement'),
    ).toMatchObject({ passed: true });
    const detail = await markets.detail(accountId, 'TX');
    expect(detail.legal.state).toBe('draft');
    expect(detail.effectiveStatus).toBe('RESEARCH_ONLY');
    expect(
      detail.technical.checks.find(
        (c) => c.key === 'template:purchase_agreement',
      )?.met,
    ).toBe(true);
    expect(detail.coverage.active).toBe(false);
  });

  it('adds an accepted Market Expansion proposal to the draft only, as unverified, and never while counsel has it', async () => {
    const accountId = await fx.tenant();
    await markets.importResearch(accountId, USER, { states: ['FL'] });
    const context = moduleRef.get(MarketAgentContextService);
    const ctx = await context.expansionContext(accountId, 'FL');
    expect(ctx.unanswered.map((q) => q.key)).toEqual(
      expect.arrayContaining(['seller_cancellation_right']),
    );
    const draftBefore = (await markets.detail(accountId, 'FL')).draft!;

    // What the worker would build from a model reply: SYNTHETIC content.
    const { proposal } = sanitizeMarketProposal(
      {
        recommendation: 'propose',
        classification: 'A',
        classification_reason: 'SYNTHETIC',
        answers: [
          {
            question: 'assignment_restrictions',
            answer: 'conditional',
            note: 'SYNTHETIC sourced',
            source_ids: ['s1'],
          },
          {
            question: 'seller_cancellation_right',
            answer: 'no',
            note: 'SYNTHETIC unsourced',
            source_ids: [],
          },
          {
            question: 'principal_assignment_without_license',
            answer: 'no',
            note: 'SYNTHETIC',
            source_ids: ['s1'],
          },
        ],
        counsel_questions: ['SYNTHETIC: a question for counsel?'],
        requirements: [],
        activation_steps: [],
        risks: [],
        rationale: 'SYNTHETIC',
        web_sources: [],
      },
      {
        state: 'FL',
        draft: draftBefore,
        researchSources: ctx.research!.sources as PolicySource[],
      },
    );
    const out = await markets.applyAgentProposal(
      accountId,
      'FL',
      USER,
      proposal,
      'run-synthetic',
    );
    expect(out.answers).toEqual([
      'assignment_restrictions',
      'seller_cancellation_right',
    ]);

    const after = await markets.detail(accountId, 'FL');
    const a = after.draft!.answers;
    expect(a.assignment_restrictions).toEqual(
      expect.objectContaining({ answer: 'conditional', sourceIds: ['s1'] }),
    );
    expect(a.assignment_restrictions.note).toMatch(
      /not verified; counsel to confirm\. Run run-synthetic/,
    );
    // Unsourced stays unknown; an answered question is left as it was.
    expect(a.seller_cancellation_right.answer).toBe('unknown');
    expect(a.principal_assignment_without_license).toEqual(
      draftBefore.answers.principal_assignment_without_license,
    );
    expect(after.draft!.openQuestions).toEqual(
      expect.arrayContaining(['SYNTHETIC: a question for counsel?']),
    );
    // Only the draft moved: no approval, no status, no review.
    expect(after.effectiveStatus).toBe('RESEARCH_ONLY');
    expect(after.requestedStatus).toBe('RESEARCH_ONLY');
    expect(after.legal.state).toBe('draft');
    expect(after.versions).toHaveLength(0);

    await prisma.market.updateMany({
      where: { accountId, state: 'FL' },
      data: { draftStatus: 'in_review' },
    });
    await expect(
      markets.applyAgentProposal(
        accountId,
        'FL',
        USER,
        proposal,
        'run-synthetic-2',
      ),
    ).rejects.toThrow('Counsel is reviewing');
  });
});
