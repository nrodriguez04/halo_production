import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Message } from '@prisma/client';
import { assertPolicy, PolicyViolationError } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { TwilioSendService } from '../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../integrations/email/email-send.service';
import { IntegrationUnavailableException } from '../integrations/integration-unavailable.exception';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { messageCounterparty } from './message-counterparty';
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
    return channel === 'sms'
      ? this.sendSms(message, recipient, ctx)
      : this.sendEmail(message, recipient, ctx);
  }

  /**
   * Control plane, DNC, consent and quiet hours, re-evaluated at the moment
   * of sending. Approval and delivery are separated by a queue: a message
   * approved at 16:00 can be delivered at 23:00 after a backlog, and the
   * contact can reply STOP in between. Only this check sees that state.
   */
  private async assertSendable(
    message: Message,
    channel: 'sms' | 'email',
    recipient: string,
  ) {
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
