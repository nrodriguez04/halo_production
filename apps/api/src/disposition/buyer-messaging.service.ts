import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CommunicationsService } from '../communications/communications.service';
import { QueueService } from '../queues/queue.service';
import { openValue } from '../pii/contact-crypto';

export { DISPOSITION_MARKETING_TYPES } from './marketing-types';

export type BuyerMessageType =
  | 'disposition_outreach'
  | 'disposition_follow_up'
  | 'offer_counter'
  | 'offer_declined';

export interface BuyerMessageResult {
  buyerId: string;
  messageId?: string;
  status: 'approved' | 'pending_approval' | 'skipped';
  reason?: string;
}

/**
 * Email to a cash buyer through the ordinary communications pipeline:
 * created with the compliance checks (control plane, DNC, consent, quiet
 * hours), sealed recipient, and either left for approval or approved by the
 * person whose action produced it (a campaign launch, a counter they typed).
 * The send path checks everything again before anything leaves.
 */
@Injectable()
export class BuyerMessagingService {
  private readonly logger = new Logger(BuyerMessagingService.name);

  constructor(
    private prisma: PrismaService,
    private communications: CommunicationsService,
    private queues: QueueService,
  ) {}

  async email(
    accountId: string,
    input: {
      dealId: string;
      buyerId: string;
      subject: string;
      body: string;
      type: BuyerMessageType;
      campaignId?: string | null;
      offerId?: string | null;
      /** Approve as this person now; otherwise the draft waits in the approval queue. */
      approveAs?: string | null;
    },
  ): Promise<BuyerMessageResult> {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: input.buyerId, accountId },
      select: { id: true, name: true, emailEnc: true, status: true },
    });
    if (!buyer)
      return {
        buyerId: input.buyerId,
        status: 'skipped',
        reason: 'buyer not found',
      };
    if (buyer.status === 'do_not_market' && input.type !== 'offer_declined') {
      return {
        buyerId: buyer.id,
        status: 'skipped',
        reason: 'buyer is marked do not market',
      };
    }
    const email = buyer.emailEnc ? openValue(buyer.emailEnc) : null;
    if (!email)
      return {
        buyerId: buyer.id,
        status: 'skipped',
        reason: 'no email on file',
      };
    let messageId: string;
    try {
      const message = await this.communications.create({
        accountId,
        dealId: input.dealId,
        channel: 'email',
        direction: 'outbound',
        content: input.body,
        metadata: {
          email,
          recipientType: 'buyer',
          buyerId: buyer.id,
          buyerName: buyer.name,
          type: input.type,
          subject: input.subject,
          ...(input.campaignId ? { campaignId: input.campaignId } : {}),
          ...(input.offerId ? { offerId: input.offerId } : {}),
        },
        source: input.approveAs ? 'user' : 'system',
      } as Parameters<CommunicationsService['create']>[0]);
      messageId = message.id;
    } catch (err) {
      return { buyerId: buyer.id, status: 'skipped', reason: describe(err) };
    }
    if (!input.approveAs) {
      return { buyerId: buyer.id, messageId, status: 'pending_approval' };
    }
    try {
      await this.communications.approve(
        messageId,
        accountId,
        input.approveAs,
        this.queues,
      );
      return { buyerId: buyer.id, messageId, status: 'approved' };
    } catch (err) {
      this.logger.warn(
        `Message ${messageId} created but not approved: ${describe(err)}`,
      );
      return {
        buyerId: buyer.id,
        messageId,
        status: 'pending_approval',
        reason: `left for approval: ${describe(err)}`,
      };
    }
  }
}

function describe(err: unknown): string {
  const e = err as {
    response?: { reason?: string; message?: string; code?: string };
    message?: string;
  };
  return (
    e?.response?.reason ??
    e?.response?.code ??
    e?.response?.message ??
    e?.message ??
    'failed'
  );
}

/** First name for a greeting, from a buyer or company name. */
export function greetingName(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return /^(llc|inc|the)$/i.test(first) || first.length < 2 ? 'there' : first;
}
