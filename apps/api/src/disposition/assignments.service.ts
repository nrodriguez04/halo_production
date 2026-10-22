import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineActorType } from '@prisma/client';
import type { DealStructure } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { DealsService } from '../deals/deals.service';
import { AuditService } from '../audit/audit.service';
import { DispositionEligibilityService } from './eligibility.service';
import { ClosingService } from './closing.service';
import { assertDealDocument } from './document-refs';
import { dealEvent } from './timeline-events';

/** Milestones that belong to one buyer; they start over when that buyer is replaced. */
const BUYER_MILESTONES = [
  'assignment_executed',
  'assignment_delivered',
  'buyer_emd_received',
  'buyer_funds_verified',
  'resale_contract_executed',
  'settlement_reviewed',
];

/**
 * Assignment agreements (docs/contract-flipping.md s6). Created only from
 * an offer a person accepted, at the price they accepted. Halo prepares and
 * tracks the assignment; it never signs it. The deal is `assigned` once a
 * person records the executed copy (or DocuSign reports every signature).
 */
@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private deals: DealsService,
    private audit: AuditService,
    private eligibility: DispositionEligibilityService,
    private closing: ClosingService,
  ) {}

  async listForDeal(accountId: string, dealId: string) {
    return this.prisma.assignmentAgreement.findMany({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
      include: {
        offer: {
          select: { id: true, amount: true, status: true, buyerId: true },
        },
      },
    });
  }

  /** Called by OffersService.accept once every check passed. */
  async createFromOffer(
    accountId: string,
    input: {
      dealId: string;
      buyerId: string;
      offerId: string;
      purchaseAgreementId: string;
      contractPrice: number;
      price: number;
      structure: DealStructure;
      buyerDepositAmount?: number;
      buyerDepositDueAt?: Date;
      buyerFundsVerified: boolean;
      approvedBy: string;
    },
  ) {
    const fee = input.price - input.contractPrice;
    // One live assignment per deal, even when two people accept two offers
    // at the same moment: the check and the insert are one serializable
    // transaction, and the loser is told to reload.
    let assignment: Awaited<
      ReturnType<typeof this.prisma.assignmentAgreement.create>
    >;
    try {
      assignment = await this.prisma.$transaction(
        async (tx) => {
          const active = await tx.assignmentAgreement.findFirst({
            where: {
              accountId,
              dealId: input.dealId,
              status: { in: ['draft', 'sent', 'executed'] },
            },
            select: { id: true, status: true },
          });
          if (active) {
            throw new ConflictException(
              `This deal already has a ${active.status} assignment (${active.id}). Cancel it before accepting another offer.`,
            );
          }
          return tx.assignmentAgreement.create({
            data: {
              accountId,
              dealId: input.dealId,
              buyerId: input.buyerId,
              offerId: input.offerId,
              purchaseAgreementId: input.purchaseAgreementId,
              structure: input.structure,
              assignmentPrice: input.price,
              assignmentFee: fee,
              buyerDepositAmount: input.buyerDepositAmount ?? null,
              buyerDepositDueAt: input.buyerDepositDueAt ?? null,
              approvedBy: input.approvedBy,
              approvedAt: new Date(),
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (err) {
      if (err instanceof ConflictException) throw err;
      const code = (err as { code?: string }).code;
      if (code === 'P2034' || code === 'P2002') {
        throw new ConflictException(
          'Another offer on this deal was accepted at the same moment. Reload the deal.',
        );
      }
      throw err;
    }
    const file = await this.closing.ensureFile(
      accountId,
      input.dealId,
      input.approvedBy,
      input.structure,
    );
    if (file.structure !== input.structure) {
      await this.closing.update(accountId, input.dealId, input.approvedBy, {
        structure: input.structure,
      });
    }
    if (input.buyerFundsVerified) {
      await this.prisma.closingMilestone.updateMany({
        where: {
          closingFileId: file.id,
          key: 'buyer_funds_verified',
          status: 'pending',
        },
        data: {
          status: 'done',
          completedAt: new Date(),
          completedBy: input.approvedBy,
          note: "Buyer's proof of funds was verified for this amount when the offer was accepted.",
        },
      });
    }
    await this.projectEconomics(
      accountId,
      input.dealId,
      input.contractPrice,
      input.price,
      fee,
    );
    await dealEvent(
      this.timeline,
      accountId,
      input.dealId,
      'ASSIGNMENT_PREPARED',
      {
        assignmentId: assignment.id,
        buyerId: input.buyerId,
        offerId: input.offerId,
        structure: input.structure,
        assignmentPrice: input.price,
        assignmentFee: fee,
        next: 'send the assignment agreement for signature, then record it executed',
      },
      input.approvedBy,
    );
    await this.closing.refreshStatus(accountId, input.dealId);
    return assignment;
  }

  /** An assignment envelope went out through DocuSign. */
  async onEnvelopeSent(
    accountId: string,
    assignmentId: string,
    contractId: string,
  ) {
    const a = await this.owned(accountId, assignmentId);
    if (a.status !== 'draft') return a;
    return this.prisma.assignmentAgreement.update({
      where: { id: a.id },
      data: { status: 'sent', contractId },
    });
  }

  async onEnvelopeCompleted(
    accountId: string,
    contractId: string,
    signedDocumentId: string | null,
    actor: { actorId: string | null; actorType: TimelineActorType },
  ) {
    const a = await this.prisma.assignmentAgreement.findFirst({
      where: { accountId, contractId },
    });
    if (!a || a.status === 'executed' || a.status === 'cancelled')
      return a?.id ?? null;
    if (!signedDocumentId) {
      // Without the signed copy a person records it with the document.
      await dealEvent(
        this.timeline,
        accountId,
        a.dealId,
        'ASSIGNMENT_SIGNED_COPY_MISSING',
        {
          assignmentId: a.id,
          contractId,
        },
        actor.actorId,
        actor.actorType,
      );
      return a.id;
    }
    await this.applyExecuted(
      accountId,
      a,
      signedDocumentId,
      new Date(),
      actor.actorId,
      actor.actorType,
    );
    return a.id;
  }

  /** A person records the executed assignment with the signed copy. */
  async markExecuted(
    accountId: string,
    assignmentId: string,
    userId: string,
    input: { executedDocumentId: string; executedAt?: Date },
  ) {
    const a = await this.owned(accountId, assignmentId);
    if (a.status === 'executed') return a;
    if (a.status === 'cancelled')
      throw new ConflictException('This assignment was cancelled.');
    const deal = await this.prisma.deal.findFirst({
      where: { id: a.dealId, accountId },
      select: { id: true, leadId: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${a.dealId} not found`);
    await assertDealDocument(
      this.prisma,
      accountId,
      input.executedDocumentId,
      deal,
      'Executed assignment',
    );
    return this.applyExecuted(
      accountId,
      a,
      input.executedDocumentId,
      input.executedAt ?? new Date(),
      userId,
      TimelineActorType.user,
    );
  }

  private async applyExecuted(
    accountId: string,
    a: {
      id: string;
      dealId: string;
      buyerId: string;
      structure: string;
      assignmentFee: number;
    },
    documentId: string,
    executedAt: Date,
    actorId: string | null,
    actorType: TimelineActorType,
  ) {
    // Executing the assignment transfers our position, so the gate is
    // checked one last time: never assign a contract we no longer hold.
    await this.eligibility.assertEligible(
      accountId,
      a.dealId,
      'executing an assignment',
    );
    const updated = await this.prisma.assignmentAgreement.update({
      where: { id: a.id },
      data: { status: 'executed', executedDocumentId: documentId, executedAt },
    });
    const file = await this.closing.loadFile(accountId, a.dealId);
    const milestoneKey =
      a.structure === 'double_close'
        ? 'resale_contract_executed'
        : 'assignment_executed';
    await this.prisma.closingMilestone.updateMany({
      where: { closingFileId: file.id, key: milestoneKey, status: 'pending' },
      data: {
        status: 'done',
        completedAt: executedAt,
        completedBy: actorId,
        evidenceDocumentId: documentId,
      },
    });
    await this.closing.redateMilestones(accountId, a.dealId);
    await this.prisma.dispositionCampaign.updateMany({
      where: {
        accountId,
        dealId: a.dealId,
        status: { in: ['active', 'paused'] },
      },
      data: {
        status: 'completed',
        endedAt: new Date(),
        endedReason: 'assigned',
      },
    });
    await this.prisma.dealShareLink.updateMany({
      where: { accountId, dealId: a.dealId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'system:assigned' },
    });
    await this.deals.updateStage(
      a.dealId,
      accountId,
      'assigned',
      actorId,
      actorType,
    );
    await dealEvent(
      this.timeline,
      accountId,
      a.dealId,
      'ASSIGNMENT_EXECUTED',
      {
        assignmentId: a.id,
        buyerId: a.buyerId,
        executedDocumentId: documentId,
        assignmentFee: a.assignmentFee,
      },
      actorId,
      actorType,
    );
    await this.closing.refreshStatus(accountId, a.dealId);
    return updated;
  }

  async recordBuyerDeposit(
    accountId: string,
    assignmentId: string,
    userId: string,
    input: { receivedAt: Date; amount?: number; documentId?: string },
  ) {
    const a = await this.owned(accountId, assignmentId);
    if (a.status === 'cancelled')
      throw new ConflictException('This assignment was cancelled.');
    if (input.documentId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: a.dealId, accountId },
        select: { id: true, leadId: true },
      });
      await assertDealDocument(
        this.prisma,
        accountId,
        input.documentId,
        deal!,
        'Deposit receipt',
      );
    }
    await this.prisma.assignmentAgreement.update({
      where: { id: a.id },
      data: {
        buyerDepositReceivedAt: input.receivedAt,
        ...(input.amount != null ? { buyerDepositAmount: input.amount } : {}),
      },
    });
    const file = await this.closing.loadFile(accountId, a.dealId);
    await this.prisma.closingMilestone.updateMany({
      where: {
        closingFileId: file.id,
        key: 'buyer_emd_received',
        status: 'pending',
      },
      data: {
        status: 'done',
        completedAt: input.receivedAt,
        completedBy: userId,
        evidenceDocumentId: input.documentId ?? null,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      a.dealId,
      'BUYER_DEPOSIT_RECEIVED',
      {
        assignmentId: a.id,
        amount: input.amount ?? a.buyerDepositAmount,
        receivedAt: input.receivedAt.toISOString(),
      },
      userId,
    );
    await this.closing.refreshStatus(accountId, a.dealId);
    return this.owned(accountId, assignmentId);
  }

  /**
   * The assignment falls through. A buyer who walked or could not fund is
   * recorded against them (the ranking learns from it); the deal goes back
   * to marketing while the seller contract is still good, and paused
   * campaigns resume so the backup buyers are still there.
   */
  async cancel(
    accountId: string,
    assignmentId: string,
    userId: string,
    input: {
      cause: 'buyer_default' | 'our_decision' | 'seller_issue' | 'title_issue';
      reason: string;
    },
  ) {
    const a = await this.owned(accountId, assignmentId);
    if (a.status === 'cancelled')
      throw new ConflictException('This assignment is already cancelled.');
    const file = await this.prisma.closingFile.findUnique({
      where: { dealId: a.dealId },
    });
    if (file?.status === 'closed') {
      throw new ConflictException(
        'The deal has closed; a closed assignment cannot be cancelled.',
      );
    }
    await this.prisma.assignmentAgreement.update({
      where: { id: a.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: `${input.cause}: ${input.reason}`,
      },
    });
    if (a.offerId) {
      await this.prisma.buyerOffer.updateMany({
        where: { id: a.offerId, accountId, status: 'accepted' },
        data: {
          status: input.cause === 'buyer_default' ? 'withdrawn' : 'rejected',
          decidedAt: new Date(),
          decidedBy: userId,
          decisionReason: `assignment cancelled (${input.cause}): ${input.reason}`,
        },
      });
    }
    if (file) {
      await this.prisma.closingMilestone.updateMany({
        where: { closingFileId: file.id, key: { in: BUYER_MILESTONES } },
        data: {
          status: 'pending',
          completedAt: null,
          completedBy: null,
          evidenceDocumentId: null,
        },
      });
    }
    await this.prisma.dealEconomics.updateMany({
      where: { dealId: a.dealId, tenantId: accountId },
      data: { assignmentPrice: null },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'assignment.cancel',
      resource: `assignment:${a.id}`,
      details: {
        dealId: a.dealId,
        buyerId: a.buyerId,
        cause: input.cause,
        reason: input.reason,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      a.dealId,
      'ASSIGNMENT_CANCELLED',
      {
        assignmentId: a.id,
        buyerId: a.buyerId,
        cause: input.cause,
        reason: input.reason,
      },
      userId,
    );

    const deal = await this.prisma.deal.findFirst({
      where: { id: a.dealId, accountId },
      select: { stage: true },
    });
    const eligibility = await this.eligibility.evaluate(accountId, a.dealId);
    let remarketed = false;
    if (eligibility.status === 'eligible') {
      if (deal?.stage === 'assigned') {
        await this.deals.updateStage(a.dealId, accountId, 'marketing', userId);
      }
      const resumed = await this.prisma.dispositionCampaign.updateMany({
        where: {
          accountId,
          dealId: a.dealId,
          status: 'paused',
          endedReason: 'buyer selected',
        },
        data: { status: 'active', endedReason: null },
      });
      remarketed = deal?.stage === 'assigned' || resumed.count > 0;
    }
    if (file) await this.closing.refreshStatus(accountId, a.dealId);
    return {
      assignment: await this.owned(accountId, assignmentId),
      remarketed,
      eligibility: eligibility.status,
      ...(eligibility.status !== 'eligible'
        ? { blockedBecause: eligibility.summary }
        : {}),
    };
  }

  private async projectEconomics(
    accountId: string,
    dealId: string,
    contractPrice: number,
    price: number,
    fee: number,
  ) {
    const existing = await this.prisma.dealEconomics.findUnique({
      where: { dealId },
      select: { tenantId: true },
    });
    const data = {
      contractPrice,
      assignmentPrice: price,
      assignmentFee: fee,
      revenueStatus: 'projected',
    };
    if (existing && existing.tenantId !== accountId) return;
    if (existing)
      await this.prisma.dealEconomics.update({ where: { dealId }, data });
    else
      await this.prisma.dealEconomics.create({
        data: { dealId, tenantId: accountId, ...data },
      });
  }

  private async owned(accountId: string, assignmentId: string) {
    const a = await this.prisma.assignmentAgreement.findFirst({
      where: { id: assignmentId, accountId },
    });
    if (!a) throw new NotFoundException(`Assignment ${assignmentId} not found`);
    return a;
  }
}

export function assertStructureAllowed(
  structure: DealStructure,
  policy: { status: string; doubleCloseAllowed: string } | null,
) {
  if (structure !== 'double_close') return;
  if (
    !policy ||
    policy.status !== 'reviewed' ||
    !['allowed', 'conditional'].includes(policy.doubleCloseAllowed)
  ) {
    throw new BadRequestException(
      "A double close needs a reviewed state policy that allows it: it has its own funding, title and disclosure requirements. Record the state's answer on the Compliance page first.",
    );
  }
}
