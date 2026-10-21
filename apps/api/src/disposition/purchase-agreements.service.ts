import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineActorType } from '@prisma/client';
import {
  AGREEMENT_VERIFICATION_KEYS,
  type Assignability,
  type DealStage,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { DealsService } from '../deals/deals.service';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { DispositionEligibilityService } from './eligibility.service';
import { ClosingService } from './closing.service';
import { assertDealDocument } from './document-refs';
import { dealEvent } from './timeline-events';

export interface AgreementTermsInput {
  purchasePrice?: number | null;
  earnestMoneyAmount?: number | null;
  earnestMoneyDueAt?: Date | null;
  inspectionEndsAt?: Date | null;
  closingDeadline?: Date | null;
  assignability?: Assignability;
  assignmentClause?: string | null;
  sellerConsentDocumentId?: string | null;
  sellerAssignmentNotice?: boolean;
  notes?: string | null;
}

/** Terms a person verifies; changing one after verification clears it. */
const VERIFIED_TERMS: Array<keyof AgreementTermsInput> = [
  'purchasePrice',
  'earnestMoneyAmount',
  'earnestMoneyDueAt',
  'closingDeadline',
  'assignability',
  'assignmentClause',
];

const OPEN_STATUSES = ['draft', 'sent', 'executed'];

/**
 * The seller contract (docs/contract-flipping.md s3). Halo records the
 * terms, files the executed copy, and has a person verify the terms against
 * it. Only then, and only if the gate passes, does the deal move into
 * marketing. An executed DocuSign envelope is a signed contract, not a
 * verified one: completion records the agreement and waits.
 */
@Injectable()
export class PurchaseAgreementsService {
  private readonly logger = new Logger(PurchaseAgreementsService.name);

  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private deals: DealsService,
    private eligibility: DispositionEligibilityService,
    private closing: ClosingService,
  ) {}

  async get(accountId: string, dealId: string) {
    await this.dealRef(accountId, dealId);
    const [agreement, history, eligibility] = await Promise.all([
      this.eligibility.currentAgreement(accountId, dealId),
      this.prisma.purchaseAgreement.findMany({
        where: { accountId, dealId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdAt: true,
          terminationReason: true,
        },
      }),
      this.eligibility.evaluate(accountId, dealId),
    ]);
    return {
      agreement,
      history,
      eligibility,
      verificationKeys: AGREEMENT_VERIFICATION_KEYS,
    };
  }

  /** Record the agreement by hand: a draft of the terms, or an executed copy signed outside DocuSign. */
  async record(
    accountId: string,
    dealId: string,
    userId: string,
    input: AgreementTermsInput & {
      status: 'draft' | 'executed';
      executedDocumentId?: string;
      executedAt?: Date;
    },
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const open = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId, status: { in: OPEN_STATUSES } },
      select: { id: true, status: true },
    });
    if (open) {
      throw new ConflictException(
        `This deal already has a ${open.status} seller contract (${open.id}). Update it, or terminate it before recording another.`,
      );
    }
    await this.assertDocuments(accountId, deal, input);
    const { status, executedDocumentId, executedAt, ...terms } = input;
    const agreement = await this.prisma.purchaseAgreement.create({
      data: {
        accountId,
        dealId,
        ...terms,
        jurisdiction: deal.state,
        status,
        executedDocumentId: status === 'executed' ? executedDocumentId : null,
        executedAt: status === 'executed' ? (executedAt ?? new Date()) : null,
        createdBy: userId,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_RECORDED',
      {
        agreementId: agreement.id,
        status,
        purchasePrice: agreement.purchasePrice,
        assignability: agreement.assignability,
      },
      userId,
    );
    if (agreement.purchasePrice != null) {
      await this.syncContractPrice(accountId, dealId, agreement.purchasePrice);
    }
    if (status === 'executed')
      await this.afterExecuted(accountId, deal, agreement.id, userId);
    return this.get(accountId, dealId);
  }

  async update(
    accountId: string,
    dealId: string,
    userId: string,
    patch: AgreementTermsInput,
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    await this.assertDocuments(accountId, deal, patch);
    const changedVerified = VERIFIED_TERMS.filter((k) => {
      if (!(k in patch)) return false;
      const before = (agreement as Record<string, unknown>)[k];
      const after = patch[k];
      const norm = (v: unknown) =>
        v instanceof Date ? v.getTime() : (v ?? null);
      return norm(before) !== norm(after);
    });
    const clearVerification =
      !!agreement.verifiedAt && changedVerified.length > 0;
    if (patch.purchasePrice != null) {
      await this.syncContractPrice(accountId, dealId, patch.purchasePrice);
    }
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        ...patch,
        ...(clearVerification
          ? {
              verifiedAt: null,
              verifiedBy: null,
              verification: Prisma.JsonNull,
            }
          : {}),
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_UPDATED',
      {
        agreementId: agreement.id,
        fields: Object.keys(patch),
        ...(clearVerification
          ? { verificationCleared: true, changedTerms: changedVerified }
          : {}),
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  /** The signed copy is on file: the agreement is executed (still to be verified). */
  async markExecuted(
    accountId: string,
    dealId: string,
    userId: string,
    input: { executedDocumentId: string; executedAt?: Date },
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    await assertDealDocument(
      this.prisma,
      accountId,
      input.executedDocumentId,
      deal,
      'Executed agreement',
    );
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        status: 'executed',
        executedDocumentId: input.executedDocumentId,
        executedAt: input.executedAt ?? agreement.executedAt ?? new Date(),
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_EXECUTED',
      {
        agreementId: agreement.id,
        executedDocumentId: input.executedDocumentId,
        next: 'verify the terms against the signed copy',
      },
      userId,
    );
    await this.afterExecuted(accountId, deal, agreement.id, userId);
    return this.get(accountId, dealId);
  }

  /**
   * A person checked every term against the signed copy. If that makes the
   * deal eligible, it moves into marketing now, as that person: one action
   * from a signed contract to a deal buyers can be offered.
   */
  async verify(
    accountId: string,
    dealId: string,
    userId: string,
    input: { confirmations: Record<string, true>; note?: string },
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    if (agreement.status !== 'executed' || !agreement.executedDocumentId) {
      throw new BadRequestException(
        'Only an executed agreement with its signed copy on file can be verified.',
      );
    }
    const missing = AGREEMENT_VERIFICATION_KEYS.filter(
      (k) => input.confirmations[k] !== true,
    );
    if (missing.length) {
      throw new BadRequestException(
        `Confirm every term: missing ${missing.join(', ')}`,
      );
    }
    if (agreement.assignability === 'unknown') {
      throw new BadRequestException(
        'Record what the assignment clause says (permitted, consent required or prohibited) before verifying.',
      );
    }
    if (agreement.purchasePrice == null || agreement.closingDeadline == null) {
      throw new BadRequestException(
        'Record the purchase price and the closing deadline before verifying.',
      );
    }
    const at = new Date().toISOString();
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        verifiedAt: new Date(),
        verifiedBy: userId,
        verification: {
          confirmed: Object.fromEntries(
            AGREEMENT_VERIFICATION_KEYS.map((k) => [k, at]),
          ),
          note: input.note ?? null,
          executedDocumentId: agreement.executedDocumentId,
        } as Prisma.InputJsonObject,
      },
    });
    // The contract price is the seller-side number buyer pricing builds on.
    await this.syncContractPrice(accountId, dealId, agreement.purchasePrice);
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_VERIFIED',
      {
        agreementId: agreement.id,
        assignability: agreement.assignability,
        closingDeadline: agreement.closingDeadline.toISOString(),
      },
      userId,
    );
    const moved = await this.advanceIfEligible(accountId, deal, userId);
    return { ...(await this.get(accountId, dealId)), stageChanged: moved };
  }

  async recordEarnestMoney(
    accountId: string,
    dealId: string,
    userId: string,
    input: { depositedAt: Date; documentId?: string },
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    if (input.documentId) {
      await assertDealDocument(
        this.prisma,
        accountId,
        input.documentId,
        deal,
        'Earnest money receipt',
      );
    }
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: { earnestMoneyDepositedAt: input.depositedAt },
    });
    const file = await this.prisma.closingFile.findUnique({
      where: { dealId },
      select: { id: true },
    });
    if (file) {
      await this.prisma.closingMilestone.updateMany({
        where: {
          closingFileId: file.id,
          key: 'seller_emd_deposited',
          status: 'pending',
        },
        data: {
          status: 'done',
          completedAt: new Date(),
          completedBy: userId,
          evidenceDocumentId: input.documentId ?? null,
        },
      });
    }
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'EARNEST_MONEY_DEPOSITED',
      {
        agreementId: agreement.id,
        depositedAt: input.depositedAt.toISOString(),
        amount: agreement.earnestMoneyAmount,
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  /** A signed extension moves the deadline; the signed document is required. */
  async extend(
    accountId: string,
    dealId: string,
    userId: string,
    input: { closingDeadline: Date; documentId: string; note?: string },
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    if (agreement.status !== 'executed') {
      throw new BadRequestException(
        'Only an executed agreement can be extended.',
      );
    }
    await assertDealDocument(
      this.prisma,
      accountId,
      input.documentId,
      deal,
      'Signed extension',
    );
    if (
      agreement.closingDeadline &&
      input.closingDeadline.getTime() <= agreement.closingDeadline.getTime()
    ) {
      throw new BadRequestException('An extension moves the deadline later.');
    }
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        closingDeadline: input.closingDeadline,
        notes: [
          agreement.notes,
          `Extended to ${input.closingDeadline.toISOString().slice(0, 10)} (document ${input.documentId})${input.note ? `: ${input.note}` : ''}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_EXTENDED',
      {
        agreementId: agreement.id,
        from: agreement.closingDeadline?.toISOString() ?? null,
        to: input.closingDeadline.toISOString(),
        documentId: input.documentId,
      },
      userId,
    );
    await this.closing.refreshStatus(accountId, dealId).catch(() => undefined);
    return this.get(accountId, dealId);
  }

  /**
   * The seller contract is gone. Buyer marketing stops at once: campaigns
   * end and every buyer link is revoked, so Halo never keeps advertising an
   * interest it no longer holds.
   */
  async terminate(
    accountId: string,
    dealId: string,
    userId: string,
    input: { status: 'terminated' | 'expired'; reason: string },
  ) {
    await this.dealRef(accountId, dealId);
    const agreement = await this.openAgreement(accountId, dealId);
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        status: input.status,
        terminatedAt: new Date(),
        terminationReason: input.reason,
      },
    });
    const now = new Date();
    const campaigns = await this.prisma.dispositionCampaign.updateMany({
      where: {
        accountId,
        dealId,
        status: { in: ['draft', 'active', 'paused'] },
      },
      data: {
        status: 'cancelled',
        endedAt: now,
        endedReason: `seller contract ${input.status}`,
      },
    });
    const links = await this.prisma.dealShareLink.updateMany({
      where: { accountId, dealId, revokedAt: null },
      data: { revokedAt: now, revokedBy: userId },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_TERMINATED',
      {
        agreementId: agreement.id,
        status: input.status,
        reason: input.reason,
        campaignsEnded: campaigns.count,
        linksRevoked: links.count,
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  // ------------------------------------------------------------ DocuSign

  /** An envelope with the seller went out: the agreement is `sent`. */
  async onEnvelopeSent(
    accountId: string,
    dealId: string,
    contractId: string,
    userId: string | null,
  ) {
    const deal = await this.dealRef(accountId, dealId);
    const draft = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId, status: { in: ['draft', 'sent'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (draft) {
      await this.prisma.purchaseAgreement.update({
        where: { id: draft.id },
        data: { status: 'sent', contractId },
      });
      return draft.id;
    }
    const executed = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId, status: 'executed' },
      select: { id: true },
    });
    if (executed) {
      // A second seller envelope on an executed deal is an amendment or an
      // addendum; it does not replace the agreement Halo relies on.
      this.logger.warn(
        `Deal ${dealId} already has an executed agreement; envelope ${contractId} recorded on the contract only`,
      );
      return null;
    }
    const created = await this.prisma.purchaseAgreement.create({
      data: {
        accountId,
        dealId,
        status: 'sent',
        contractId,
        jurisdiction: deal.state,
        createdBy: userId,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'PURCHASE_AGREEMENT_SENT',
      {
        agreementId: created.id,
        contractId,
        next: 'record the price, deadline and assignment clause while the seller signs',
      },
      userId,
    );
    return created.id;
  }

  /** Everyone signed: executed, with the signed copy when it was stored. */
  async onEnvelopeCompleted(
    accountId: string,
    contractId: string,
    signedDocumentId: string | null,
    actor: { actorId: string | null; actorType: TimelineActorType },
  ) {
    const agreement = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, contractId },
    });
    if (!agreement || agreement.status === 'executed')
      return agreement?.id ?? null;
    const deal = await this.dealRef(accountId, agreement.dealId);
    await this.prisma.purchaseAgreement.update({
      where: { id: agreement.id },
      data: {
        status: 'executed',
        executedAt: new Date(),
        executedDocumentId: signedDocumentId ?? agreement.executedDocumentId,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      agreement.dealId,
      'PURCHASE_AGREEMENT_EXECUTED',
      {
        agreementId: agreement.id,
        contractId,
        executedDocumentId: signedDocumentId,
        next: 'verify the terms against the signed copy before marketing',
      },
      actor.actorId,
      actor.actorType,
    );
    await this.afterExecuted(accountId, deal, agreement.id, actor.actorId);
    return agreement.id;
  }

  // ------------------------------------------------------------- helpers

  /** Title work starts when the contract is signed; the deal is under contract. */
  private async afterExecuted(
    accountId: string,
    deal: { id: string; stage: string },
    agreementId: string,
    actorId: string | null,
  ) {
    await this.closing.ensureFile(accountId, deal.id, actorId);
    if (deal.stage === 'negotiating') {
      await this.deals.updateStage(
        deal.id,
        accountId,
        'under_contract',
        actorId,
        actorId ? TimelineActorType.user : TimelineActorType.system,
      );
    }
    this.logger.log(`Agreement ${agreementId} executed for deal ${deal.id}`);
  }

  /**
   * Into marketing when the gate passes: from under_contract (the usual
   * path) or from negotiating when the agreement was recorded by hand.
   */
  private async advanceIfEligible(
    accountId: string,
    deal: { id: string },
    userId: string,
  ): Promise<DealStage | null> {
    const current = await this.prisma.deal.findFirst({
      where: { id: deal.id, accountId },
      select: { stage: true },
    });
    if (!current) return null;
    const e = await this.eligibility.evaluate(accountId, deal.id);
    if (e.status !== 'eligible') return null;
    if (current.stage === 'negotiating') {
      await this.deals.updateStage(
        deal.id,
        accountId,
        'under_contract',
        userId,
      );
    }
    if (current.stage === 'negotiating' || current.stage === 'under_contract') {
      await this.deals.updateStage(deal.id, accountId, 'marketing', userId);
      return 'marketing';
    }
    return null;
  }

  private async syncContractPrice(
    accountId: string,
    dealId: string,
    price: number,
  ) {
    const existing = await this.prisma.dealEconomics.findUnique({
      where: { dealId },
      select: { tenantId: true },
    });
    if (existing && existing.tenantId !== accountId) return;
    if (existing) {
      await this.prisma.dealEconomics.update({
        where: { dealId },
        data: { contractPrice: price },
      });
    } else {
      await this.prisma.dealEconomics.create({
        data: { dealId, tenantId: accountId, contractPrice: price },
      });
    }
  }

  private async assertDocuments(
    accountId: string,
    deal: { id: string; leadId: string | null },
    input: {
      sellerConsentDocumentId?: string | null;
      executedDocumentId?: string;
    },
  ) {
    if (input.sellerConsentDocumentId) {
      await assertDealDocument(
        this.prisma,
        accountId,
        input.sellerConsentDocumentId,
        deal,
        "Seller's consent to assign",
      );
    }
    if (input.executedDocumentId) {
      await assertDealDocument(
        this.prisma,
        accountId,
        input.executedDocumentId,
        deal,
        'Executed agreement',
      );
    }
  }

  private async openAgreement(accountId: string, dealId: string) {
    const agreement = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId, status: { in: OPEN_STATUSES } },
      orderBy: { createdAt: 'desc' },
    });
    if (!agreement) {
      throw new NotFoundException('This deal has no open seller contract.');
    }
    return agreement;
  }

  private async dealRef(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        id: true,
        leadId: true,
        stage: true,
        property: { select: { state: true } },
        lead: { select: { canonicalState: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    return {
      id: deal.id,
      leadId: deal.leadId,
      stage: deal.stage,
      state: normalizeState(
        deal.property?.state ?? deal.lead?.canonicalState ?? null,
      ),
    };
  }
}
