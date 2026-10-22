import { Injectable, Logger } from '@nestjs/common';
import {
  isHelpKeyword,
  isOptOutKeyword,
  normalizeKeyword,
  normalizePhoneNumber,
} from '@halo/shared';
import { PrismaService } from '../../prisma.service';
import { AutomationService } from '../../automation/automation.service';
import { AgentOrchestrationService } from '../../agent/agent-orchestration.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { OptOutService } from '../../compliance/opt-out.service';
import { GLOBAL_ACCOUNT_ID } from '../../control-plane/control-plane.service';
import { counterpartyColumns } from '../../communications/message-counterparty';
import {
  helpReply,
  keywordRepliesEnabled,
  optOutConfirmation,
} from './keyword-replies';

/**
 * Inbound replies that cannot be matched to exactly one tenant are stored
 * here, where no tenant sees them, rather than leaking into the wrong one.
 * Opt-outs are never only stored here: see handleOptOut.
 */
export const UNATTRIBUTED_ACCOUNT_ID = 'unknown';

interface InboundLink {
  leadId: string;
  dealId: string | null;
}

export interface InboundResult {
  handled: 'opt_out' | 'help' | 'message';
  /** Text to send back on the same number as TwiML, or null for none. */
  reply: string | null;
}

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(
    private prisma: PrismaService,
    private automationService: AutomationService,
    private pii: LeadPiiService,
    private optOut: OptOutService,
    private agents: AgentOrchestrationService,
  ) {}

  async handleInbound(body: any): Promise<InboundResult> {
    const from = String(body.From ?? '');
    const to = body.To;
    const messageBody = typeof body.Body === 'string' ? body.Body : '';

    // Whole-message, case-insensitive keyword matches only; "I can't stop
    // by today" is an ordinary reply, END / QUIT / REVOKE are opt-outs.
    if (isOptOutKeyword(messageBody)) {
      return this.handleOptOut(from, to, messageBody, body.MessageSid);
    }

    const accountId = await this.resolveAccountId(to, from);

    if (isHelpKeyword(messageBody)) {
      await this.recordInbound(
        accountId,
        from,
        to,
        messageBody,
        body.MessageSid,
        {
          handledHelp: true,
        },
      );
      return {
        handled: 'help',
        reply: keywordRepliesEnabled() ? helpReply() : null,
      };
    }

    // The reply joins its lead and open deal, so the thread, attribution
    // and the Outreach Drafter all see it. A text from a buyer instead
    // joins the buyer and the deal Halo last wrote to them about, for the
    // Buyer Responder, which only drafts.
    const link = await this.linkToLead(accountId, from);
    const buyerLink = link ? null : await this.linkToBuyer(accountId, from);
    const inboundMsg = await this.recordInbound(
      buyerLink?.accountId ?? accountId,
      from,
      to,
      messageBody,
      body.MessageSid,
      buyerLink ? { buyerId: buyerLink.buyerId, recipientType: 'buyer' } : {},
      link ??
        (buyerLink?.dealId ? { leadId: null, dealId: buyerLink.dealId } : null),
    );
    if (buyerLink?.dealId) {
      try {
        await this.agents.enqueue({
          agent: 'buyer_responder',
          accountId: buyerLink.accountId,
          entityType: 'deal',
          entityId: buyerLink.dealId,
          trigger: 'inbound',
          triggerEventId: `inbound:${inboundMsg.id}`,
          messageId: inboundMsg.id,
        });
      } catch (err) {
        this.logger.warn(
          `Could not queue the Buyer Responder for text ${inboundMsg.id}: ${err}`,
        );
      }
      return { handled: 'message', reply: null };
    }

    try {
      await this.automationService.attributeReply(inboundMsg.id, accountId);
    } catch (err) {
      this.logger.warn(
        `Attribution failed for message ${inboundMsg.id}: ${err}`,
      );
    }

    await this.queueDrafter(accountId, inboundMsg.id, link);

    return { handled: 'message', reply: null };
  }

  /**
   * The sender number is shared by every tenant, so a STOP cannot be tied
   * to one tenant's message. It is recorded for every tenant that has
   * messaged this number or holds it on a lead, buyer or consent, and in
   * the GLOBAL scope (which every tenant's DNC check reads) when none does.
   * It used to be filed under the 'unknown' tenant, which suppressed nobody.
   */
  private async handleOptOut(
    from: string,
    to: string,
    text: string,
    messageSid: string,
  ): Promise<InboundResult> {
    const tenants = await this.findMatchingAccountIds(from, {
      exhaustive: true,
    });
    const keyword = normalizeKeyword(text);
    const recorded = await this.optOut.recordPhoneOptOut({
      accountIds: tenants,
      phone: from,
      source: 'stop_keyword',
      reason: `Replied ${keyword}`,
    });

    await this.recordInbound(
      tenants.length === 1 ? tenants[0] : UNATTRIBUTED_ACCOUNT_ID,
      from,
      to,
      text,
      messageSid,
      {
        handledStop: true,
        keyword,
        optOutScopes: recorded.accountIds.length,
      },
    );

    return {
      handled: 'opt_out',
      reply: keywordRepliesEnabled() ? optOutConfirmation() : null,
    };
  }

  /**
   * The lead this sender is on in the tenant, and its open deal. Null when
   * the tenant is unknown or no lead carries the number.
   */
  private async linkToLead(
    accountId: string,
    fromPhone: string,
  ): Promise<InboundLink | null> {
    if (accountId === UNATTRIBUTED_ACCOUNT_ID) return null;
    const hashes = Array.from(
      new Set(
        this.buildPhoneCandidates(fromPhone).map((phone) =>
          this.pii.phoneHash(phone),
        ),
      ),
    );
    if (hashes.length === 0) return null;
    try {
      const lead = await this.prisma.lead.findFirst({
        where: { accountId, canonicalPhoneHash: { in: hashes } },
        orderBy: { updatedAt: 'desc' },
        select: {
          id: true,
          deals: {
            where: { stage: { not: 'lost' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { id: true },
          },
        },
      });
      if (!lead) return null;
      return { leadId: lead.id, dealId: lead.deals[0]?.id ?? null };
    } catch (err) {
      this.logger.warn(`Could not link inbound reply to a lead: ${err}`);
      return null;
    }
  }

  /**
   * The buyer this number belongs to, and the deal Halo last wrote to them
   * about. Searches the tenant the number resolved to, else every tenant
   * that holds it on a buyer, and only links when exactly one does.
   */
  private async linkToBuyer(
    accountId: string,
    fromPhone: string,
  ): Promise<{
    accountId: string;
    buyerId: string;
    dealId: string | null;
  } | null> {
    const hashes = Array.from(
      new Set(
        this.buildPhoneCandidates(fromPhone).map((phone) =>
          this.pii.phoneHash(phone),
        ),
      ),
    );
    if (hashes.length === 0) return null;
    try {
      const buyers = await this.prisma.buyer.findMany({
        where: {
          phoneHash: { in: hashes },
          ...(accountId !== UNATTRIBUTED_ACCOUNT_ID ? { accountId } : {}),
        },
        select: { id: true, accountId: true },
        take: 2,
      });
      if (buyers.length !== 1) return null;
      const buyer = buyers[0];
      const last = await this.prisma.message.findFirst({
        where: {
          accountId: buyer.accountId,
          direction: 'outbound',
          dealId: { not: null },
          metadata: { path: ['buyerId'], equals: buyer.id },
        },
        orderBy: { createdAt: 'desc' },
        select: { dealId: true },
      });
      return {
        accountId: buyer.accountId,
        buyerId: buyer.id,
        dealId: last?.dealId ?? null,
      };
    } catch (err) {
      this.logger.warn(`Could not link inbound text to a buyer: ${err}`);
      return null;
    }
  }

  /** Design doc s3.3: every linked reply gets the Outreach Drafter's read. */
  private async queueDrafter(
    accountId: string,
    messageId: string,
    link: InboundLink | null,
  ) {
    if (!link) return;
    try {
      await this.agents.enqueue({
        agent: 'outreach_drafter',
        accountId,
        entityType: link.dealId ? 'deal' : 'lead',
        entityId: link.dealId ?? link.leadId,
        trigger: 'inbound',
        triggerEventId: `inbound:${messageId}`,
        messageId,
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue the Outreach Drafter for message ${messageId}: ${err}`,
      );
    }
  }

  private recordInbound(
    accountId: string,
    from: string,
    to: string,
    content: string,
    messageSid: string,
    extra: Record<string, unknown> = {},
    link: InboundLink | null = null,
  ) {
    return this.prisma.message.create({
      data: {
        accountId,
        channel: 'sms',
        direction: 'inbound',
        status: 'delivered',
        content,
        ...(link ? { leadId: link.leadId, dealId: link.dealId } : {}),
        ...counterpartyColumns('sms', from),
        metadata: {
          to,
          twilioMessageSid: messageSid,
          ...extra,
        },
      },
    });
  }

  async handleStatus(body: any) {
    const messageSid = body.MessageSid;
    const status = body.MessageStatus;

    const messages = await this.prisma.message.findMany({
      where: {
        metadata: {
          path: ['twilioMessageSid'],
          equals: messageSid,
        },
      },
    });

    if (messages.length > 0) {
      await this.prisma.message.update({
        where: { id: messages[0].id },
        data: {
          status: this.nextStatus(
            messages[0].status,
            this.mapTwilioStatus(status),
          ),
          metadata: {
            ...((messages[0].metadata as any) || {}),
            deliveryStatus: status,
            deliveryStatusUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }

    return { message: 'Status updated' };
  }

  /**
   * The tenant an ordinary reply belongs to: the single tenant that has
   * messaged this sender or holds it on a lead. We use a shared Twilio
   * sender number, so a sender that matches several tenants fails closed
   * instead of leaking the reply to whichever tenant wrote most recently.
   */
  private async resolveAccountId(
    toPhone: string,
    fromPhone: string,
  ): Promise<string> {
    const accountIds = await this.findMatchingAccountIds(fromPhone);

    if (accountIds.length === 1) {
      return accountIds[0];
    }

    if (accountIds.length > 1) {
      this.logger.warn(
        `Ambiguous accountId for inbound Twilio message to=${toPhone}; matched ${accountIds.length} tenants, defaulting to '${UNATTRIBUTED_ACCOUNT_ID}'`,
      );
      return UNATTRIBUTED_ACCOUNT_ID;
    }

    this.logger.warn(
      `Could not resolve accountId for inbound Twilio message to=${toPhone}, defaulting to '${UNATTRIBUTED_ACCOUNT_ID}'`,
    );
    return UNATTRIBUTED_ACCOUNT_ID;
  }

  /**
   * Tenants with a relationship to the sender. Attribution only needs to
   * know whether there is exactly one (outbound messages and leads, two
   * rows each). An opt-out needs all of them, so `exhaustive` drops the
   * limit and adds buyers and consents.
   */
  private async findMatchingAccountIds(
    fromPhone: string,
    opts: { exhaustive?: boolean } = {},
  ): Promise<string[]> {
    const phoneCandidates = this.buildPhoneCandidates(fromPhone);
    if (phoneCandidates.length === 0) return [];
    const hashes = Array.from(
      new Set(phoneCandidates.map((phone) => this.pii.phoneHash(phone))),
    );
    const take = opts.exhaustive ? undefined : 2;

    const lookups: Promise<{ accountId: string }[]>[] = [
      this.prisma.message.findMany({
        where: {
          direction: 'outbound',
          OR: [
            // Indexed blind-index match on the recipient; the JSON arm covers
            // rows the backfill has not reached and goes once it has run.
            { counterpartyHash: { in: hashes } },
            ...phoneCandidates.map((phone) => ({
              metadata: {
                path: ['to'],
                string_contains: phone,
              },
            })),
          ],
        },
        select: { accountId: true },
        distinct: ['accountId'],
        take,
      }),
      this.prisma.lead.findMany({
        where: { canonicalPhoneHash: { in: hashes } },
        select: { accountId: true },
        distinct: ['accountId'],
        take,
      }),
    ];
    if (opts.exhaustive) {
      lookups.push(
        this.prisma.buyer.findMany({
          where: { phoneHash: { in: hashes } },
          select: { accountId: true },
          distinct: ['accountId'],
        }),
        this.prisma.consent.findMany({
          where: { phoneHash: { in: hashes } },
          select: { accountId: true },
          distinct: ['accountId'],
        }),
      );
    }

    const matches = (await Promise.all(lookups)).flat();
    return Array.from(
      new Set(
        matches
          .map((match) => match.accountId)
          .filter(
            (accountId): accountId is string =>
              !!accountId &&
              accountId !== UNATTRIBUTED_ACCOUNT_ID &&
              accountId !== GLOBAL_ACCOUNT_ID,
          ),
      ),
    );
  }

  private buildPhoneCandidates(phone: string): string[] {
    const trimmed = phone.trim();
    if (!trimmed) return [];
    const normalized = normalizePhoneNumber(trimmed);
    return Array.from(new Set([trimmed, normalized].filter(Boolean)));
  }

  /**
   * Twilio transport states -> app workflow states. A callback only exists
   * for a message that was already approved and handed to Twilio, so no
   * transport state maps back to `pending_approval`; `queued` used to, which
   * let a retried or out-of-order callback reopen a delivered SMS in the
   * approval queue and invite a second send.
   */
  private mapTwilioStatus(status: string): string | null {
    const statusMap: Record<string, string> = {
      accepted: 'sent',
      queued: 'sent',
      sending: 'sent',
      sent: 'sent',
      delivered: 'delivered',
      read: 'delivered',
      failed: 'failed',
      undelivered: 'failed',
      canceled: 'failed',
    };

    return statusMap[status] ?? null;
  }

  /**
   * Workflow status is monotonic once dispatched: sent -> delivered, and
   * failed is terminal unless delivery was already confirmed. Callbacks can
   * arrive out of order, so a later `sent` must not undo `delivered`.
   */
  private nextStatus(current: string, incoming: string | null): string {
    if (!incoming) return current;
    const rank: Record<string, number> = {
      pending_approval: 0,
      approved: 1,
      blocked: 1,
      sent: 2,
      delivered: 3,
      failed: 3,
    };
    if (current === 'delivered') return current;
    if (incoming === 'failed') return 'failed';
    if (current === 'failed') return current;
    return (rank[incoming] ?? 0) > (rank[current] ?? 0) ? incoming : current;
  }
}
