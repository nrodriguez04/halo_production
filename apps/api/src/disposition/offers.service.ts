import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  assignmentFeeFor,
  canTransitionOffer,
  evaluatePolicy,
  negotiationBoundsRule,
  recommendAssignmentPricing,
  underwriteDeal,
  type DealStructure,
  type OfferEvaluation,
  type OfferStatus,
  type PricingRecommendation,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { AuditService } from '../audit/audit.service';
import { brandName } from '../communications/outbound-content';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { DispositionEligibilityService } from './eligibility.service';
import {
  AssignmentsService,
  assertStructureAllowed,
} from './assignments.service';
import { BuyerMessagingService, greetingName } from './buyer-messaging.service';
import { buyerEvent, daysBetween, dealEvent } from './timeline-events';

const OPEN: OfferStatus[] = ['received', 'countered'];

export const UNQUALIFIED_BUYER = 'UNQUALIFIED_BUYER';

export interface OfferInput {
  buyerId: string;
  amount: number;
  kind: 'indication' | 'written_offer';
  source: 'email' | 'sms' | 'deal_page' | 'phone' | 'manual';
  sourceMessageId?: string;
  campaignId?: string;
  earnestMoney?: number;
  closeBy?: Date;
  financing?: string;
  conditions?: string;
  pofProvided?: boolean;
  expiresAt?: Date;
}

function money(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Buyer offers (docs/contract-flipping.md s5). Every offer is priced by the
 * deterministic engine (packages/shared fee-pricing.ts) against the seller
 * contract, the tenant's minimum profit and the demand actually seen.
 * Accepting, countering and rejecting are a person's decisions; an agent
 * can only recommend them, and acceptance checks the gate, the buyer's
 * qualification and the minimum profit before an assignment is prepared.
 */
@Injectable()
export class OffersService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private controlPlane: ControlPlaneService,
    private audit: AuditService,
    private eligibility: DispositionEligibilityService,
    private assignments: AssignmentsService,
    private messaging: BuyerMessagingService,
  ) {}

  async list(accountId: string, dealId: string) {
    const [offers, pricing] = await Promise.all([
      this.prisma.buyerOffer.findMany({
        where: { accountId, dealId },
        orderBy: [{ createdAt: 'desc' }],
        include: {
          buyer: {
            select: {
              id: true,
              name: true,
              company: true,
              pofStatus: true,
              pofAmount: true,
              pofExpiresAt: true,
              status: true,
            },
          },
        },
      }),
      this.pricing(accountId, dealId).catch(() => null),
    ]);
    const byId = new Map<string, OfferEvaluation>(
      (pricing?.recommendation.offers ?? []).map((o) => [o.offerId, o]),
    );
    return {
      offers: offers.map((o) => ({
        ...o,
        recommendation: byId.get(o.id) ?? null,
      })),
      pricing,
    };
  }

  /**
   * The deterministic underwriting of the deal as it stands: the ARV and
   * repairs on record (a person's or the Underwriter's), the tenant's fee,
   * costs and thresholds, and the contract price once there is one.
   */
  async underwriting(accountId: string, dealId: string) {
    const [deal, agreement, cp] = await Promise.all([
      this.prisma.deal.findFirst({
        where: { id: dealId, accountId },
        include: {
          economics: true,
          underwritingResult: { select: { confidence: true } },
          property: { select: { salePrice: true } },
        },
      }),
      this.eligibility.currentAgreement(accountId, dealId),
      this.controlPlane.getStatus(accountId),
    ]);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const e = deal.economics;
    const knownCosts =
      (e?.closingCosts ?? 0) +
      (e?.marketingCost ?? 0) +
      (e?.otherCost ?? 0) +
      (e?.skipTraceCost ?? 0);
    return underwriteDeal({
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      assignmentFee: assignmentFeeFor(
        e?.assignmentFee,
        cp.defaultAssignmentFee,
      ),
      transactionCosts: knownCosts > 0 ? knownCosts : cp.dispositionCosts,
      minNetProfit: cp.minNetProfit,
      confidence: deal.underwritingResult?.confidence ?? null,
      minConfidence: cp.minUnderwritingConfidence,
      contractPrice:
        agreement &&
        agreement.status !== 'terminated' &&
        agreement.status !== 'expired'
          ? (agreement.purchasePrice ?? e?.contractPrice ?? null)
          : (e?.contractPrice ?? null),
      sellerAsk: deal.property?.salePrice ?? null,
    });
  }

  /**
   * The offer to the seller, set by a person within the policy bounds
   * (the shared negotiationBoundsRule): up to the computed MAO. Above it,
   * or while the numbers need review, a reason is required and recorded.
   * The Outreach Drafter may then repeat this amount to the seller; it
   * never proposes one of its own.
   */
  async setSellerOffer(
    accountId: string,
    dealId: string,
    userId: string,
    input: { amount: number; reason?: string },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: { id: true, stage: true, offerAmount: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    if (!['new', 'contacted', 'negotiating'].includes(deal.stage)) {
      throw new ConflictException(
        `The deal is ${deal.stage.replace('_', ' ')}: the price is in the seller contract now.`,
      );
    }
    const u = await this.underwriting(accountId, dealId);
    const [bounds] = evaluatePolicy(
      {
        tenantId: accountId,
        actorId: userId,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'deal.set_seller_offer',
        channel: 'other',
        dealId,
        minOffer: 1,
        maxOffer: u.mao ?? 0,
        proposedOffer: input.amount,
      },
      [negotiationBoundsRule],
    );
    const problems: string[] = [];
    if (!bounds.allow) {
      problems.push(
        u.mao != null && u.mao > 0
          ? `$${input.amount.toLocaleString('en-US')} is above the MAO of $${u.mao.toLocaleString('en-US')}`
          : 'there is no positive MAO for this deal',
      );
    }
    if (u.recommendation === 'needs_review') {
      problems.push(`the numbers need review (${u.flags.join(', ')})`);
    }
    if (problems.length && !input.reason) {
      throw new BadRequestException({
        code: 'OFFER_OUT_OF_BOUNDS',
        message: `This offer needs a reason: ${problems.join('; ')}.`,
        problems,
      });
    }
    await this.prisma.deal.update({
      where: { id: deal.id },
      data: { offerAmount: input.amount },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'deal.seller_offer',
      resource: `deal:${dealId}`,
      details: {
        amount: input.amount,
        previous: deal.offerAmount,
        mao: u.mao,
        offerRange: u.offerRange,
        outsidePolicy: problems,
        reason: input.reason ?? null,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'SELLER_OFFER_SET',
      {
        amount: input.amount,
        mao: u.mao,
        offerRange: u.offerRange,
        ...(problems.length
          ? { outsidePolicy: problems, reason: input.reason }
          : {}),
      },
      userId,
    );
    return {
      offerAmount: input.amount,
      mao: u.mao,
      offerRange: u.offerRange,
      outsidePolicy: problems,
    };
  }

  /** The pricing recommendation for the deal, with the inputs it used. */
  async pricing(accountId: string, dealId: string, now = new Date()) {
    const [deal, agreement, cp] = await Promise.all([
      this.prisma.deal.findFirst({
        where: { id: dealId, accountId },
        include: { economics: true },
      }),
      this.eligibility.currentAgreement(accountId, dealId),
      this.controlPlane.getStatus(accountId),
    ]);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const contractPrice =
      agreement?.purchasePrice ?? deal.economics?.contractPrice ?? null;
    if (contractPrice == null) {
      throw new BadRequestException(
        'Pricing needs the contract price: record it on the seller contract.',
      );
    }
    const [offers, campaign] = await Promise.all([
      this.prisma.buyerOffer.findMany({
        where: { accountId, dealId },
        include: {
          buyer: {
            select: { pofStatus: true, pofAmount: true, pofExpiresAt: true },
          },
        },
      }),
      this.prisma.dispositionCampaign.findFirst({
        where: { accountId, dealId, status: { in: ['active', 'paused'] } },
        orderBy: { createdAt: 'desc' },
        include: { targets: { select: { status: true } } },
      }),
    ]);
    const e = deal.economics;
    const knownCosts =
      (e?.closingCosts ?? 0) +
      (e?.marketingCost ?? 0) +
      (e?.otherCost ?? 0) +
      (e?.skipTraceCost ?? 0);
    const costs = knownCosts > 0 ? knownCosts : cp.dispositionCosts;
    const targetFee = e?.assignmentFee ?? cp.defaultAssignmentFee;
    const targets = campaign?.targets ?? [];
    const input = {
      contractPrice,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      transactionCosts: costs,
      minNetProfit: cp.minNetProfit,
      targetNetProfit: Math.max(targetFee - costs, cp.minNetProfit),
      daysToDeadline: agreement?.closingDeadline
        ? daysBetween(now, agreement.closingDeadline)
        : null,
      currentAskingPrice: campaign?.askingPrice ?? e?.assignmentPrice ?? null,
      offers: offers.map((o) => ({
        id: o.id,
        amount: o.amount,
        kind: o.kind as 'indication' | 'written_offer',
        open: OPEN.includes(o.status as OfferStatus),
        fundsVerified:
          o.buyer.pofStatus === 'verified' &&
          (o.buyer.pofExpiresAt == null ||
            o.buyer.pofExpiresAt.getTime() > now.getTime()) &&
          (o.buyer.pofAmount ?? 0) >= o.amount,
      })),
      interestedCount: targets.filter((t) => t.status === 'interested').length,
      contactedCount: targets.filter(
        (t) => t.status !== 'selected' && t.status !== 'skipped',
      ).length,
    };
    const recommendation: PricingRecommendation =
      recommendAssignmentPricing(input);
    return { input, recommendation };
  }

  // ------------------------------------------------------------ capture

  async record(
    accountId: string,
    dealId: string,
    userId: string,
    input: OfferInput,
  ) {
    return this.create(accountId, dealId, input, {
      capturedBy: 'person',
      actorId: userId,
      confirmed: true,
    });
  }

  /** The buyer typed it on their deal page: their own written statement. */
  async recordFromBuyer(accountId: string, dealId: string, input: OfferInput) {
    return this.create(accountId, dealId, input, {
      capturedBy: 'buyer',
      actorId: null,
      confirmed: false,
    });
  }

  /** Read out of a buyer's email by the Buyer Responder: to be confirmed by a person. */
  async recordFromAgent(
    accountId: string,
    dealId: string,
    input: OfferInput & { confidence: number; automationRunId: string },
  ) {
    return this.create(accountId, dealId, input, {
      capturedBy: 'agent',
      actorId: null,
      confirmed: false,
      confidence: input.confidence,
      automationRunId: input.automationRunId,
    });
  }

  private async create(
    accountId: string,
    dealId: string,
    input: OfferInput,
    how: {
      capturedBy: 'person' | 'buyer' | 'agent';
      actorId: string | null;
      confirmed: boolean;
      confidence?: number;
      automationRunId?: string;
    },
  ) {
    const [deal, buyer, agreement] = await Promise.all([
      this.prisma.deal.findFirst({
        where: { id: dealId, accountId },
        select: { id: true, stage: true },
      }),
      this.prisma.buyer.findFirst({
        where: { id: input.buyerId, accountId },
        select: { id: true, name: true },
      }),
      this.eligibility.currentAgreement(accountId, dealId),
    ]);
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    if (!buyer) throw new NotFoundException(`Buyer ${input.buyerId} not found`);
    if (!agreement || agreement.status !== 'executed') {
      throw new BadRequestException(
        'Offers are taken on a deal with an executed seller contract: there is nothing to assign yet.',
      );
    }
    if (['closed', 'lost'].includes(deal.stage)) {
      throw new ConflictException(`The deal is ${deal.stage}.`);
    }
    let campaignId = input.campaignId ?? null;
    if (campaignId) {
      const c = await this.prisma.dispositionCampaign.findFirst({
        where: { id: campaignId, accountId, dealId },
        select: { id: true },
      });
      if (!c)
        throw new BadRequestException('That campaign is not on this deal.');
    } else {
      campaignId =
        (
          await this.prisma.dispositionCampaign.findFirst({
            where: { accountId, dealId, status: { in: ['active', 'paused'] } },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
        )?.id ?? null;
    }
    // A buyer's newer offer replaces their older open one.
    const superseded = await this.prisma.buyerOffer.updateMany({
      where: { accountId, dealId, buyerId: buyer.id, status: { in: OPEN } },
      data: {
        status: 'superseded',
        decidedAt: new Date(),
        decisionReason: 'replaced by a newer offer',
      },
    });
    const offer = await this.prisma.buyerOffer.create({
      data: {
        accountId,
        dealId,
        buyerId: buyer.id,
        campaignId,
        kind: input.kind,
        source: input.source,
        sourceMessageId: input.sourceMessageId ?? null,
        capturedBy: how.capturedBy,
        captureConfidence: how.confidence ?? null,
        confirmedAt: how.confirmed ? new Date() : null,
        confirmedBy: how.confirmed ? how.actorId : null,
        amount: input.amount,
        earnestMoney: input.earnestMoney ?? null,
        closeBy: input.closeBy ?? null,
        financing: input.financing ?? null,
        conditions: input.conditions ?? null,
        pofProvided: input.pofProvided ?? false,
        expiresAt: input.expiresAt ?? null,
        createdBy: how.actorId,
      },
    });
    if (campaignId) {
      await this.prisma.dispositionTarget.updateMany({
        where: { campaignId, buyerId: buyer.id },
        data: { status: 'offered', lastActivityAt: new Date() },
      });
    }
    await this.snapshotEvaluation(accountId, dealId, offer.id);
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'BUYER_OFFER_RECEIVED',
      {
        offerId: offer.id,
        buyerId: buyer.id,
        buyerName: buyer.name,
        amount: offer.amount,
        kind: offer.kind,
        source: offer.source,
        capturedBy: how.capturedBy,
        ...(how.automationRunId
          ? { automationRunId: how.automationRunId }
          : {}),
        ...(superseded.count ? { superseded: superseded.count } : {}),
      },
      how.actorId,
    );
    await buyerEvent(
      this.timeline,
      accountId,
      buyer.id,
      'BUYER_OFFER_MADE',
      {
        offerId: offer.id,
        dealId,
        amount: offer.amount,
      },
      how.actorId,
    );
    return this.get(accountId, offer.id);
  }

  async get(accountId: string, offerId: string) {
    const offer = await this.prisma.buyerOffer.findFirst({
      where: { id: offerId, accountId },
      include: {
        buyer: {
          select: { id: true, name: true, pofStatus: true, pofAmount: true },
        },
      },
    });
    if (!offer) throw new NotFoundException(`Offer ${offerId} not found`);
    return offer;
  }

  /** A person checked an agent-captured amount against the buyer's message. */
  async confirm(
    accountId: string,
    offerId: string,
    userId: string,
    amount?: number,
  ) {
    const offer = await this.get(accountId, offerId);
    if (offer.confirmedAt) return offer;
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        confirmedAt: new Date(),
        confirmedBy: userId,
        ...(amount != null && amount !== offer.amount ? { amount } : {}),
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      offer.dealId,
      'BUYER_OFFER_CONFIRMED',
      {
        offerId: offer.id,
        amount: amount ?? offer.amount,
        corrected:
          amount != null && amount !== offer.amount
            ? { from: offer.amount }
            : undefined,
      },
      userId,
    );
    await this.snapshotEvaluation(accountId, offer.dealId, offer.id);
    return this.get(accountId, offer.id);
  }

  // ---------------------------------------------------------- decisions

  async counter(
    accountId: string,
    offerId: string,
    userId: string,
    input: { amount: number; notifyBuyer: boolean; message?: string },
  ) {
    const offer = await this.openOffer(accountId, offerId, 'countered');
    await this.eligibility.assertEligible(
      accountId,
      offer.dealId,
      'countering a buyer',
    );
    const { recommendation } = await this.pricing(accountId, offer.dealId);
    if (input.amount < recommendation.floorPrice) {
      throw new BadRequestException(
        `A counter of ${money(input.amount)} is below the floor (${money(recommendation.floorPrice)}): it would not clear the minimum profit.`,
      );
    }
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        status: 'countered',
        counterAmount: input.amount,
        counteredAt: new Date(),
        counteredBy: userId,
        evaluation: recommendation as unknown as Prisma.InputJsonObject,
      },
    });
    let notification = null;
    if (input.notifyBuyer) {
      const property = await this.propertyLine(accountId, offer.dealId);
      notification = await this.messaging.email(accountId, {
        dealId: offer.dealId,
        buyerId: offer.buyerId,
        offerId: offer.id,
        type: 'offer_counter',
        subject: `Re: your offer on ${property}`,
        body:
          `Hi ${greetingName(offer.buyer.name)},\n\n` +
          `Thank you for your offer of ${money(offer.amount)} on ${property}. ` +
          `We can do ${money(input.amount)} for the assignment of our contract.` +
          (input.message ? `\n\n${input.message}` : '') +
          `\n\nThis is not binding on either side until the written assignment agreement is signed.\n\n${brandName()}`,
        approveAs: userId,
      });
    }
    await dealEvent(
      this.timeline,
      accountId,
      offer.dealId,
      'BUYER_OFFER_COUNTERED',
      {
        offerId: offer.id,
        buyerId: offer.buyerId,
        offered: offer.amount,
        counter: input.amount,
        notification: notification?.status ?? 'not sent',
      },
      userId,
    );
    return { offer: await this.get(accountId, offer.id), notification };
  }

  async reject(
    accountId: string,
    offerId: string,
    userId: string,
    input: { reason?: string; notifyBuyer: boolean },
  ) {
    const offer = await this.openOffer(accountId, offerId, 'rejected');
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        status: 'rejected',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionReason: input.reason ?? null,
      },
    });
    let notification = null;
    if (input.notifyBuyer) {
      const property = await this.propertyLine(accountId, offer.dealId);
      notification = await this.messaging.email(accountId, {
        dealId: offer.dealId,
        buyerId: offer.buyerId,
        offerId: offer.id,
        type: 'offer_declined',
        subject: `Re: your offer on ${property}`,
        body:
          `Hi ${greetingName(offer.buyer.name)},\n\n` +
          `Thank you for your offer on ${property}. We are not able to accept it. ` +
          `We will keep you in mind for the next one.\n\n${brandName()}`,
        approveAs: userId,
      });
    }
    await dealEvent(
      this.timeline,
      accountId,
      offer.dealId,
      'BUYER_OFFER_REJECTED',
      {
        offerId: offer.id,
        buyerId: offer.buyerId,
        amount: offer.amount,
        reason: input.reason ?? null,
        notification: notification?.status ?? 'not sent',
      },
      userId,
    );
    return { offer: await this.get(accountId, offer.id), notification };
  }

  async withdraw(
    accountId: string,
    offerId: string,
    userId: string,
    reason?: string,
  ) {
    const offer = await this.openOffer(accountId, offerId, 'withdrawn');
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        status: 'withdrawn',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionReason: reason ?? 'buyer withdrew',
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      offer.dealId,
      'BUYER_OFFER_WITHDRAWN',
      {
        offerId: offer.id,
        buyerId: offer.buyerId,
        reason: reason ?? null,
      },
      userId,
    );
    return this.get(accountId, offer.id);
  }

  /**
   * A person accepts. Every check runs here, in this order, and each refusal
   * says what to do: the offer is open, written and confirmed; the deal may
   * be assigned; the buyer is active, contactable and has verified funds for
   * the price; the price clears the contract price and (unless a reason is
   * given) the minimum profit; the structure is one the state allows.
   */
  async accept(
    accountId: string,
    offerId: string,
    userId: string,
    input: {
      structure: DealStructure;
      atCounter?: boolean;
      buyerDepositAmount?: number;
      buyerDepositDueAt?: Date;
      belowMinimumReason?: string;
    },
  ) {
    const offer = await this.openOffer(accountId, offerId, 'accepted');
    if (offer.kind !== 'written_offer') {
      throw new BadRequestException(
        'An indication of interest cannot be accepted: ask the buyer for a written offer.',
      );
    }
    if (offer.capturedBy === 'agent' && !offer.confirmedAt) {
      throw new BadRequestException(
        "This amount was read out of the buyer's email by an agent. Check it against the message and confirm it first.",
      );
    }
    if (
      input.atCounter &&
      (offer.status !== 'countered' || offer.counterAmount == null)
    ) {
      throw new BadRequestException(
        'There is no counter on this offer to accept at.',
      );
    }
    const price = input.atCounter
      ? (offer.counterAmount as number)
      : offer.amount;

    const eligibility = await this.eligibility.assertEligible(
      accountId,
      offer.dealId,
      'accepting a buyer',
    );
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      offer.dealId,
    );
    if (!agreement?.purchasePrice) {
      throw new BadRequestException(
        'The seller contract has no purchase price recorded.',
      );
    }

    const cp = await this.controlPlane.getStatus(accountId);
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: offer.buyerId, accountId },
    });
    if (!buyer) throw new NotFoundException('Buyer not found');
    const problems: string[] = [];
    if (buyer.status !== 'active')
      problems.push(`the buyer is ${buyer.status.replace(/_/g, ' ')}`);
    const dnc = await this.prisma.dNCList.findFirst({
      where: {
        accountId: { in: [accountId, 'GLOBAL'] },
        OR: [
          ...(buyer.emailHash ? [{ emailHash: buyer.emailHash }] : []),
          ...(buyer.phoneHash ? [{ phoneHash: buyer.phoneHash }] : []),
        ],
      },
      select: { id: true },
    });
    if (dnc) problems.push('the buyer opted out of contact');
    const pofLive =
      buyer.pofExpiresAt == null || buyer.pofExpiresAt.getTime() > Date.now();
    const fundsVerified =
      buyer.pofStatus === 'verified' &&
      pofLive &&
      (buyer.pofAmount ?? 0) >= price;
    if (cp.requireVerifiedPof && !fundsVerified) {
      problems.push(
        buyer.pofStatus !== 'verified'
          ? `proof of funds is ${buyer.pofStatus}, not verified`
          : !pofLive
            ? 'proof of funds has expired'
            : `verified funds (${money(buyer.pofAmount ?? 0)}) do not cover ${money(price)}`,
      );
    }
    if (problems.length) {
      throw new ForbiddenException({
        code: UNQUALIFIED_BUYER,
        message: `This buyer is not qualified to be accepted: ${problems.join('; ')}.`,
        problems,
      });
    }

    const contractPrice = agreement.purchasePrice;
    if (price <= contractPrice) {
      throw new BadRequestException(
        `${money(price)} does not exceed the contract price: there would be no assignment fee.`,
      );
    }
    const { recommendation, input: pricingInput } = await this.pricing(
      accountId,
      offer.dealId,
    );
    const net = price - contractPrice - pricingInput.transactionCosts;
    if (net < cp.minNetProfit && !input.belowMinimumReason) {
      throw new BadRequestException({
        code: 'BELOW_MINIMUM_PROFIT',
        message: `At ${money(price)} the net is ${money(net)}, below the minimum of ${money(cp.minNetProfit)}. Give a reason to accept anyway.`,
      });
    }

    const state = normalizeState(eligibility.state);
    const policy = state
      ? await this.prisma.jurisdictionPolicy.findUnique({
          where: { accountId_state: { accountId, state } },
        })
      : null;
    assertStructureAllowed(input.structure, policy);

    const assignment = await this.assignments.createFromOffer(accountId, {
      dealId: offer.dealId,
      buyerId: buyer.id,
      offerId: offer.id,
      purchaseAgreementId: agreement.id,
      contractPrice,
      price,
      structure: input.structure,
      buyerDepositAmount:
        input.buyerDepositAmount ?? offer.earnestMoney ?? undefined,
      buyerDepositDueAt: input.buyerDepositDueAt,
      buyerFundsVerified: fundsVerified,
      approvedBy: userId,
    });
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        status: 'accepted',
        decidedAt: new Date(),
        decidedBy: userId,
        decisionReason: input.belowMinimumReason ?? null,
        ...(input.atCounter ? { amount: price } : {}),
        evaluation: recommendation as unknown as Prisma.InputJsonObject,
      },
    });
    // Outreach stops while the chosen buyer signs; the other offers stay as backups.
    await this.prisma.dispositionCampaign.updateMany({
      where: { accountId, dealId: offer.dealId, status: 'active' },
      data: { status: 'paused', endedReason: 'buyer selected' },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'offer.accept',
      resource: `offer:${offer.id}`,
      details: {
        dealId: offer.dealId,
        buyerId: buyer.id,
        price,
        contractPrice,
        fee: price - contractPrice,
        net,
        belowMinimumReason: input.belowMinimumReason ?? null,
        structure: input.structure,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      offer.dealId,
      'BUYER_OFFER_ACCEPTED',
      {
        offerId: offer.id,
        buyerId: buyer.id,
        price,
        assignmentId: assignment.id,
        fee: price - contractPrice,
        ...(input.belowMinimumReason
          ? { belowMinimumReason: input.belowMinimumReason }
          : {}),
      },
      userId,
    );
    return { offer: await this.get(accountId, offer.id), assignment };
  }

  /** Offers past their expiry stop counting as demand. */
  async expireStale(now = new Date()) {
    const res = await this.prisma.buyerOffer.updateMany({
      where: { status: { in: OPEN }, expiresAt: { lt: now } },
      data: {
        status: 'expired',
        decidedAt: now,
        decisionReason: 'offer expired',
      },
    });
    return res.count;
  }

  private async openOffer(accountId: string, offerId: string, to: OfferStatus) {
    const offer = await this.get(accountId, offerId);
    const same = offer.status === to && to !== 'countered';
    if (same || !canTransitionOffer(offer.status as OfferStatus, to)) {
      throw new ConflictException(
        `The offer is ${offer.status}; it cannot be ${to}.`,
      );
    }
    if (offer.expiresAt && offer.expiresAt.getTime() < Date.now()) {
      throw new ConflictException('The offer has expired.');
    }
    return offer;
  }

  private async snapshotEvaluation(
    accountId: string,
    dealId: string,
    offerId: string,
  ) {
    try {
      const { recommendation } = await this.pricing(accountId, dealId);
      const evaluation = recommendation.offers.find(
        (o) => o.offerId === offerId,
      );
      if (evaluation) {
        await this.prisma.buyerOffer.update({
          where: { id: offerId },
          data: {
            evaluation: {
              ...evaluation,
              demand: recommendation.demand,
            } as unknown as Prisma.InputJsonObject,
          },
        });
      }
    } catch {
      // Pricing needs the contract price; an offer is still recorded without it.
    }
  }

  private async propertyLine(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: { property: { select: { address: true, city: true } } },
    });
    return deal?.property
      ? `${deal.property.address}, ${deal.property.city}`
      : 'the property';
  }
}
