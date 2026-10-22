import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Message } from '@prisma/client';
import {
  assertPolicy,
  PolicyViolationError,
  classifyMessage,
  isInternalRecipient,
  switchesAllow,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { MarketsService } from '../markets/markets.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { TwilioSendService } from '../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../integrations/email/email-send.service';
import { IntegrationUnavailableException } from '../integrations/integration-unavailable.exception';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { messageCounterparty } from './message-counterparty';
import { DealsService } from '../deals/deals.service';
import { DisclosureGateService } from '../compliance/disclosure-gate.service';
import { DispositionEligibilityService } from '../disposition/eligibility.service';
import { DISPOSITION_MARKETING_TYPES } from '../disposition/marketing-types';
import { TimelineActorType } from '@prisma/client';
import { composeEmail, emailSettings, withSmsOptOut } from './outbound-content';

export type DispatchReceipt =
  | {
      channel: 'sms';
      sid: string | null;
      numSegments: number | null;
      status: string | null;
    }
  | {
      channel: 'email';
      providerMessageId: string | null;
      provider: string | null;
    };

/**
 * The only path from a message to a provider.
 *
 * It sends a stored, outbound Message that a person approved, by id: the
 * recipient is the message's encrypted counterparty and the body is the
 * approved content plus the opt-out text composed here, so neither who is
 * contacted nor what they are sent comes from the caller. The internal
 * `sms/send` and `email/send` routes it replaces took any `to` and any body
 * with no message row at all, behind nothing but the shared internal token.
 */
@Injectable()
export class MessageDispatchService {
  constructor(
    private prisma: PrismaService,
    private compliance: ComplianceService,
    private controlPlane: ControlPlaneService,
    private twilio: TwilioSendService,
    private email: EmailSendService,
    private deals: DealsService,
    private disclosure: DisclosureGateService,
    private eligibility: DispositionEligibilityService,
    private markets: MarketsService,
  ) {}

  async sendApproved(
    accountId: string,
    messageId: string,
  ): Promise<DispatchReceipt> {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, accountId },
    });
    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }
    if (message.direction !== 'outbound') {
      throw new ConflictException(
        `Message ${messageId} is ${message.direction}; only outbound messages are sent`,
      );
    }
    if (
      message.status !== 'approved' ||
      !message.approvedAt ||
      !message.approvedBy
    ) {
      throw new ConflictException(
        `Message ${messageId} is "${message.status}"; only an approved message can be sent`,
      );
    }
    const channel = message.channel;
    if (channel !== 'sms' && channel !== 'email') {
      throw new UnprocessableEntityException(
        `Message ${messageId} has unsupported channel "${channel}"`,
      );
    }
    const recipient = messageCounterparty(message);
    if (!recipient) {
      throw new UnprocessableEntityException(
        `Message ${messageId} has no stored recipient`,
      );
    }

    await this.assertSendable(message, channel, recipient);

    const ctx: CostContext = {
      accountId,
      actor: 'system',
      leadId: message.leadId ?? undefined,
      dealId: message.dealId ?? undefined,
      automationRunId: message.automationRunId ?? undefined,
    };
    const receipt =
      channel === 'sms'
        ? await this.sendSms(message, recipient, ctx)
        : await this.sendEmail(message, recipient, ctx);
    await this.markDealContacted(message);
    return receipt;
  }

  /**
   * The first message that reaches a seller moves the deal from new to
   * contacted, which is what the follow-up sweep, the Deal Underwriter and
   * the Outreach Drafter key off. Best effort: the send already happened.
   */
  private async markDealContacted(message: Message) {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    if (!message.dealId || !message.leadId) return;
    if (meta.recipientType === 'buyer' || meta.type === 'buyer_blast') return;
    try {
      const deal = await this.prisma.deal.findFirst({
        where: { id: message.dealId, accountId: message.accountId },
        select: { stage: true },
      });
      if (deal?.stage !== 'new') return;
      await this.deals.updateStage(
        message.dealId,
        message.accountId,
        'contacted',
        null,
        TimelineActorType.system,
      );
    } catch {
      // A stage race or a missing deal must not turn a delivered message
      // into a failed send.
    }
  }

  /**
   * Buyer marketing for a Texas deal needs the equitable-interest notice on
   * file. A message that markets the contract itself (a blast, campaign
   * outreach, a follow-up, a counter) also needs the deal to pass the
   * disposition gate at the moment it leaves: a message approved yesterday
   * must not advertise a contract that expired overnight. Replies to a
   * buyer (including "this one is gone") are not marketing and still send.
   */
  private async assertBuyerDisclosure(message: Message) {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const toBuyer =
      meta.recipientType === 'buyer' || meta.type === 'buyer_blast';
    if (!toBuyer || !message.dealId) return;
    await this.disclosure.assertEquitableInterest(
      message.accountId,
      message.dealId,
      'marketing this deal to buyers',
    );
    if (
      typeof meta.type === 'string' &&
      DISPOSITION_MARKETING_TYPES.has(meta.type)
    ) {
      await this.eligibility.assertEligible(
        message.accountId,
        message.dealId,
        'marketing this contract to buyers',
      );
    }
  }

  /**
   * Control plane, DNC, consent and quiet hours, re-evaluated at the moment
   * of sending. Approval and delivery are separated by a queue: a message
   * approved at 16:00 can be delivered at 23:00 after a backlog, and the
   * contact can reply STOP in between. Only this check sees that state.
   */
  /**
   * The market gate (docs/markets.md s3): a seller is contacted only where
   * the market allows seller outreach, and a contract is marketed to buyers
   * only on a channel the approved policy permits. Replies to a buyer are
   * not marketing and pass.
   */
  private async assertMarket(message: Message, channel: 'sms' | 'email') {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    const toBuyer =
      meta.recipientType === 'buyer' || meta.type === 'buyer_blast';
    const marketing =
      toBuyer &&
      (meta.type === 'buyer_blast' ||
        (typeof meta.type === 'string' &&
          DISPOSITION_MARKETING_TYPES.has(meta.type)));
    if (toBuyer && !marketing) return;
    const state = await this.messageState(message);
    if (marketing) {
      await this.markets.assertChannel(
        message.accountId,
        state,
        channel === 'email' ? 'investor_email' : 'investor_sms',
        'Marketing this contract to buyers',
      );
      return;
    }
    if (message.leadId || message.dealId) {
      await this.markets.assertAllowed(
        message.accountId,
        state,
        'seller_outreach',
        'Contacting this seller',
      );
    }
  }

  private async messageState(message: Message): Promise<string | null> {
    if (message.dealId) {
      const deal = await this.prisma.deal.findFirst({
        where: { id: message.dealId, accountId: message.accountId },
        select: {
          property: { select: { state: true } },
          lead: { select: { canonicalState: true } },
        },
      });
      const s = deal?.property?.state ?? deal?.lead?.canonicalState;
      if (s) return s;
    }
    if (message.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: message.leadId, accountId: message.accountId },
        select: { canonicalState: true },
      });
      return lead?.canonicalState ?? null;
    }
    return null;
  }

  private async assertSendable(
    message: Message,
    channel: 'sms' | 'email',
    recipient: string,
  ) {
    // An internal test goes only to the operator's allowlisted address,
    // whatever the switches say; nothing else about it is checked.
    const cls = classifyMessage(message.metadata);
    if (cls === 'internal_test') {
      if (
        channel !== 'email' ||
        !isInternalRecipient(recipient, process.env.EMAIL_INTERNAL_RECIPIENTS)
      ) {
        throw new ComplianceBlockedException(
          'NOT_INTERNAL_RECIPIENT',
          'A test send goes only to an address on EMAIL_INTERNAL_RECIPIENTS.',
        );
      }
      return;
    }
    await this.assertBuyerDisclosure(message);
    await this.assertMarket(message, channel);
    const [controlPlane, facts] = await Promise.all([
      this.controlPlane.getStatus(message.accountId, { provision: false }),
      this.compliance.getFacts({
        accountId: message.accountId,
        channel,
        phone: channel === 'sms' ? recipient : undefined,
        email: channel === 'email' ? recipient : undefined,
        leadId: message.leadId,
      }),
    ]);

    // Marketing needs its own switch on top of the channel's.
    const switches = switchesAllow(cls, channel, controlPlane);
    if (!switches.allowed) {
      throw new ComplianceBlockedException(
        cls === 'marketing' &&
          controlPlane.enabled &&
          (channel === 'email'
            ? controlPlane.emailEnabled
            : controlPlane.smsEnabled)
          ? 'CONTROL_PLANE_MARKETING_DISABLED'
          : 'CONTROL_PLANE_MESSAGING_DISABLED',
        switches.reason,
        { channel, messageClass: cls },
      );
    }
    try {
      assertPolicy({
        tenantId: message.accountId,
        actorId: null,
        actorType: 'system',
        now: new Date(),
        requestedAction:
          channel === 'sms' ? 'comms.send_sms' : 'comms.send_email',
        channel,
        leadId: message.leadId ?? undefined,
        dealId: message.dealId ?? undefined,
        messageId: message.id,
        sideEffectsEnabled: controlPlane.enabled,
        messagingEnabled:
          channel === 'sms'
            ? controlPlane.smsEnabled
            : controlPlane.emailEnabled,
        isDnc: facts.isDnc,
        hasConsent: facts.hasConsent,
        consentSource: facts.consentSource,
        timezone: facts.timezone,
        localHour: facts.localHour,
        quietHoursStart: facts.quietHoursStart,
        quietHoursEnd: facts.quietHoursEnd,
      });
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        throw new ComplianceBlockedException(err.code, err.reason, {
          channel,
          ...(facts.timezone ? { timezone: facts.timezone } : {}),
          ...(typeof facts.localHour === 'number'
            ? { localHour: facts.localHour }
            : {}),
        });
      }
      throw err;
    }
  }

  private async sendSms(
    message: Message,
    to: string,
    ctx: CostContext,
  ): Promise<DispatchReceipt> {
    const from = process.env.TWILIO_PHONE_NUMBER?.trim();
    if (!from) {
      throw IntegrationUnavailableException.notConfigured(
        'twilio',
        'TWILIO_PHONE_NUMBER',
      );
    }
    const result = await this.twilio.sendSms(
      {
        to,
        from,
        body: withSmsOptOut(message.content),
        // Idempotency key, so a retried job cannot double-send.
        messageId: message.id,
      },
      ctx,
    );
    return {
      channel: 'sms',
      sid: result?.sid ?? null,
      numSegments: result?.numSegments ?? null,
      status: result?.status ?? null,
    };
  }

  private async sendEmail(
    message: Message,
    to: string,
    ctx: CostContext,
  ): Promise<DispatchReceipt> {
    const settings = emailSettings();
    const metadata = (message.metadata ?? {}) as Record<string, unknown>;
    const email = composeEmail({
      messageId: message.id,
      content: message.content,
      subject: metadata.subject,
      settings,
    });
    const result = await this.email.sendEmail(
      {
        to,
        from: settings.from,
        subject: email.subject,
        text: email.text,
        html: email.html,
        headers: email.headers,
        messageId: message.id,
        ...(settings.replyTo ? { replyTo: settings.replyTo } : {}),
      },
      ctx,
    );
    return {
      channel: 'email',
      providerMessageId: result?.messageId ?? null,
      provider: result?.provider ?? null,
    };
  }
}
