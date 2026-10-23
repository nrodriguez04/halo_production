/**
 * The owner's risk acceptance (docs/markets.md s3.1) on a real database:
 * accepted from research with every required answer sourced, labelled as
 * the owner's and never as counsel's, refused for class E, for unknowns and
 * for unsourced answers, and used by the gates like counsel's approval.
 * Templates likewise. Everything is SYNTHETIC.
 */
import type { TestingModule } from '@nestjs/testing';
import { USER, buildModule, describeDb, fixtures } from './harness';
import { PrismaService } from '../../src/prisma.service';
import { MarketsService } from '../../src/markets/markets.service';
import { TemplatesService } from '../../src/templates/templates.service';
import { OWNER_ACCEPTANCE_ATTESTATION } from '@halo/shared';

const REASON =
  'SYNTHETIC: research reviewed; the business accepts the risk for a first Texas deal.';

describeDb('owner risk acceptance (synthetic, real database)', () => {
  let moduleRef: TestingModule;
  let fx: ReturnType<typeof fixtures>;
  let prisma: PrismaService;
  let markets: MarketsService;

  beforeAll(async () => {
    moduleRef = await buildModule();
    fx = fixtures(moduleRef);
    prisma = moduleRef.get(PrismaService);
    markets = moduleRef.get(MarketsService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await fx.cleanup();
    await moduleRef?.close();
  });

  it("accepts a sourced policy as the owner's, never as counsel's, and the gates use it", async () => {
    const accountId = await fx.tenant();
    await markets.importResearch(accountId, USER, {
      states: ['TX', 'AK', 'FL'],
    });

    const before = await markets.detail(accountId, 'TX');
    expect(before.ownerAcceptance).toEqual([]);
    expect(before.legal.basis).toBeNull();

    const tx = await markets.acceptRisk(accountId, 'TX', USER, {
      acceptedByName: 'SYNTHETIC Owner',
      reason: REASON,
      attest: true,
    });
    expect(tx.legal).toMatchObject({
      state: 'approved',
      basis: 'owner_risk_acceptance',
      counselName: null,
      acceptedByName: 'SYNTHETIC Owner',
    });
    expect(tx.approvalBasis).toBe('owner_risk_acceptance');
    // Past legal review, now held by what any approval needs: templates and
    // the entity registration the policy requires.
    expect(tx.maxStatus).toBe('PENDING_REQUIREMENTS');

    const version = await prisma.marketPolicyVersion.findFirstOrThrow({
      where: { accountId, state: 'TX' },
    });
    expect(version).toMatchObject({
      basis: 'owner_risk_acceptance',
      counselName: null,
      memoDocumentId: null,
      acceptedByName: 'SYNTHETIC Owner',
      acceptanceReason: REASON,
      attestation: OWNER_ACCEPTANCE_ATTESTATION,
    });
    const days =
      (version.reviewExpiresAt!.getTime() - version.approvedAt.getTime()) /
      86_400_000;
    expect(days).toBeGreaterThan(180);
    expect(days).toBeLessThan(184);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { accountId, action: 'market.policy.accept_risk' },
    });
    expect(audit.details).toMatchObject({
      basis: 'owner_risk_acceptance',
      acceptedByName: 'SYNTHETIC Owner',
    });

    // Class E needs counsel; an unknown required answer blocks.
    await expect(
      markets.acceptRisk(accountId, 'AK', USER, {
        acceptedByName: 'SYNTHETIC Owner',
        reason: REASON,
        attest: true,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'POLICY_NOT_ACCEPTABLE',
        problems: expect.arrayContaining([
          'class E (not currently authorized) can only be approved by counsel',
        ]),
      }),
    });
    const fl = await markets.detail(accountId, 'FL');
    expect(fl.ownerAcceptance).toEqual(
      expect.arrayContaining([
        '"Does the seller have a statutory right to cancel?" is unknown',
      ]),
    );

    // An answer with no source cannot be accepted, and a review longer
    // than six months is refused.
    const market = await prisma.market.findFirstOrThrow({
      where: { accountId, state: 'TX' },
    });
    const draft = market.draft as {
      answers: Record<string, { sourceIds: string[] }>;
    };
    draft.answers.wholesaler_registration_required.sourceIds = [];
    await prisma.market.update({
      where: { id: market.id },
      data: { draft: draft as object },
    });
    expect((await markets.detail(accountId, 'TX')).ownerAcceptance).toEqual([
      '"Is a wholesaler registration required?" cites no source',
    ]);
    await expect(
      markets.acceptRisk(accountId, 'TX', USER, {
        acceptedByName: 'SYNTHETIC Owner',
        reason: REASON,
        attest: true,
      }),
    ).rejects.toThrow(/cites no source/);
    await expect(
      markets.acceptRisk(accountId, 'AZ', USER, {
        acceptedByName: 'SYNTHETIC Owner',
        reason: REASON,
        attest: true,
        reviewExpiresAt: new Date(Date.now() + 300 * 86_400_000),
      }),
    ).rejects.toThrow(/at most 6 months/);
  });

  it("accepts a template as the owner's, and the market counts it as approved", async () => {
    const templates = moduleRef.get(TemplatesService);
    const accountId = await fx.tenant();
    await markets.importResearch(accountId, USER, { states: ['TN'] });
    const source = await fx.doc(
      accountId,
      'purchase_agreement template',
      {},
      [],
      'agreement_template',
      {
        text: 'SYNTHETIC purchase agreement between {{buyer_entity}} and {{seller_name}} for {{property_address}} at {{purchase_price}}, earnest money {{earnest_money}}, closing by {{closing_deadline}}. [SELLER_SIGNATURE]',
        fileName: 'purchase.txt',
      },
    );
    const { version } = await templates.create(accountId, USER, {
      kind: 'purchase_agreement',
      name: 'SYNTHETIC TN purchase',
      documentId: source.id,
      states: ['TN'],
    });
    const accepted = await templates.acceptRisk(accountId, version.id, USER, {
      acceptedByName: 'SYNTHETIC Owner',
      reason: REASON,
      attest: true,
    });
    expect(accepted).toMatchObject({
      status: 'approved',
      approvalBasis: 'owner_risk_acceptance',
      counselName: null,
      acceptedByName: 'SYNTHETIC Owner',
    });
    const tn = await markets.detail(accountId, 'TN');
    expect(tn.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'purchase_agreement',
          status: 'approved',
          approvalBasis: 'owner_risk_acceptance',
        }),
      ]),
    );
  });
});
