import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { isInternalRecipient } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { IntegrationSecretsService } from '../integration-secrets/integration-secrets.service';
import { OptOutService } from '../compliance/opt-out.service';
import { MessageDispatchService } from './message-dispatch.service';
import { counterpartyColumns } from './message-counterparty';
import { maskEmail, maskPhone, openValue } from '../pii/contact-crypto';

/** Opt-outs the recipient made: Halo never removes these on an operator's say-so. */
const RECIPIENT_OPT_OUTS = new Set([
  'unsubscribe_link',
  'stop_keyword',
  'complaint',
  'provider_unsubscribe',
  'deal_page',
  'external',
]);

export interface ReadinessCheck {
  key: string;
  label: string;
  ok: boolean;
  required: boolean;
  detail: string;
}

/**
 * Communications settings (docs/communications.md): whether email and SMS
 * are configured, an internal test send, the suppression list, delivery
 * metrics and seller consent. Turning external sending on stays a
 * deliberate Control Plane decision; nothing here does it.
 */
@Injectable()
export class CommunicationsAdminService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private controlPlane: ControlPlaneService,
    private secrets: IntegrationSecretsService,
    private optOut: OptOutService,
    private dispatch: MessageDispatchService,
  ) {}

  /** What is configured, what each switch is, and which kinds of message could go today. */
  async readiness(accountId: string) {
    const env = (k: string) => !!process.env[k]?.trim();
    const sendgridKey = await this.secrets.resolve(
      'sendgrid',
      'SENDGRID_API_KEY',
    );
    const provider =
      process.env.USE_SENDGRID === 'true' && sendgridKey
        ? 'sendgrid'
        : env('RESEND_API_KEY')
          ? 'resend'
          : env('SMTP_HOST')
            ? 'smtp'
            : null;
    const sendgridEvents = await this.secrets.resolve(
      'sendgrid',
      'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY',
    );
    const resendEvents = await this.secrets.resolve(
      'resend',
      'RESEND_WEBHOOK_SECRET',
    );
    const inbound =
      (await this.secrets.resolve('sendgrid', 'SENDGRID_INBOUND_TOKEN')) ||
      process.env.INBOUND_EMAIL_TOKEN;
    const twilioSid = await this.secrets.resolve(
      'twilio',
      'TWILIO_ACCOUNT_SID',
    );
    const twilioToken = await this.secrets.resolve(
      'twilio',
      'TWILIO_AUTH_TOKEN',
    );
    const cp = await this.controlPlane.getStatus(accountId, {
      provision: false,
    });

    const email: ReadinessCheck[] = [
      {
        key: 'provider',
        label: 'Email provider',
        ok: !!provider,
        required: true,
        detail: provider
          ? `Sending through ${provider}.`
          : 'Set USE_SENDGRID with a SendGrid key, RESEND_API_KEY, or SMTP_HOST.',
      },
      {
        key: 'from',
        label: 'Sender address (EMAIL_FROM)',
        ok: env('EMAIL_FROM') || env('SENDGRID_FROM_EMAIL'),
        required: true,
        detail: 'The verified address mail comes from.',
      },
      {
        key: 'postal',
        label: 'Postal address (EMAIL_POSTAL_ADDRESS)',
        ok: env('EMAIL_POSTAL_ADDRESS'),
        required: true,
        detail:
          'CAN-SPAM requires a physical address in every commercial email.',
      },
      {
        key: 'public_api_url',
        label: 'Public API URL (PUBLIC_API_URL)',
        ok: env('PUBLIC_API_URL'),
        required: true,
        detail: 'Unsubscribe links point here.',
      },
      {
        key: 'public_app_url',
        label: 'Public app URL (PUBLIC_APP_URL)',
        ok: env('PUBLIC_APP_URL'),
        required: false,
        detail: 'Buyer deal-page links point here; campaigns need it.',
      },
      {
        key: 'reply_to',
        label: 'Reply-To address (EMAIL_REPLY_TO)',
        ok: env('EMAIL_REPLY_TO'),
        required: false,
        detail:
          'Replies reach the inbound-parse address so Halo can match them.',
      },
      {
        key: 'inbound',
        label: 'Inbound parse token',
        ok: !!inbound,
        required: false,
        detail: 'Authenticates the inbound email webhook.',
      },
      {
        key: 'events',
        label: 'Delivery event webhook',
        ok: !!(sendgridEvents || resendEvents),
        required: false,
        detail:
          'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY or RESEND_WEBHOOK_SECRET: bounces and complaints suppress addresses automatically.',
      },
      {
        key: 'internal',
        label: 'Internal test recipients (EMAIL_INTERNAL_RECIPIENTS)',
        ok: env('EMAIL_INTERNAL_RECIPIENTS'),
        required: false,
        detail: 'Only these addresses can receive a test send.',
      },
    ];
    const sms: ReadinessCheck[] = [
      {
        key: 'twilio',
        label: 'Twilio account',
        ok: !!twilioSid && !!twilioToken,
        required: true,
        detail: 'TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
      },
      {
        key: 'number',
        label: 'Sending number (TWILIO_PHONE_NUMBER)',
        ok: env('TWILIO_PHONE_NUMBER'),
        required: true,
        detail: 'The number messages come from.',
      },
    ];
    const base = email.filter((c) => c.required).every((c) => c.ok);
    const api = process.env.PUBLIC_API_URL?.replace(/\/+$/, '') ?? null;
    return {
      switches: {
        enabled: cp.enabled,
        emailEnabled: cp.emailEnabled,
        marketingEmailEnabled: cp.marketingEmailEnabled,
        smsEnabled: cp.smsEnabled,
        marketingSmsEnabled: cp.marketingSmsEnabled,
      },
      email,
      sms,
      canSend: {
        internalTest: base && env('EMAIL_INTERNAL_RECIPIENTS'),
        transactionalEmail: base && cp.enabled && cp.emailEnabled,
        marketingEmail:
          base &&
          cp.enabled &&
          cp.emailEnabled &&
          cp.marketingEmailEnabled &&
          env('PUBLIC_APP_URL'),
        sms: sms.every((c) => c.ok) && cp.enabled && cp.smsEnabled,
        marketingSms:
          sms.every((c) => c.ok) &&
          cp.enabled &&
          cp.smsEnabled &&
          cp.marketingSmsEnabled,
      },
      webhooks: api
        ? {
            inboundEmail: `${api}/webhooks/email/inbound`,
            sendgridEvents: `${api}/webhooks/email/sendgrid-events`,
            resendEvents: `${api}/webhooks/email/resend-events`,
            twilioInbound: `${api}/webhooks/twilio/inbound`,
            twilioStatus: `${api}/webhooks/twilio/status`,
          }
        : null,
    };
  }

  /**
   * Send a test email to an internal address. Works with the Control Plane
   * switches off, because it can only reach the operator's own allowlisted
   * addresses (EMAIL_INTERNAL_RECIPIENTS); it goes through the real provider.
   */
  async testSend(accountId: string, userId: string, to: string) {
    const address = to.trim().toLowerCase();
    if (!isInternalRecipient(address, process.env.EMAIL_INTERNAL_RECIPIENTS)) {
      throw new ForbiddenException(
        'Test sends go only to addresses listed in EMAIL_INTERNAL_RECIPIENTS.',
      );
    }
    const message = await this.prisma.message.create({
      data: {
        accountId,
        channel: 'email',
        direction: 'outbound',
        content:
          'This is a Halo test send. It confirms the email provider, sender, footer and unsubscribe link are configured. No action is needed.',
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
        source: 'internal_test',
        metadata: {
          type: 'internal_test',
          messageClass: 'internal_test',
          subject: 'Halo test send',
        } as Prisma.InputJsonObject,
        ...counterpartyColumns('email', address),
      },
    });
    try {
      const sent = await this.dispatch.sendApproved(accountId, message.id);
      const receipt =
        sent.channel === 'email'
          ? {
              provider: sent.provider,
              providerMessageId: sent.providerMessageId,
            }
          : { provider: null, providerMessageId: null };
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          metadata: {
            type: 'internal_test',
            messageClass: 'internal_test',
            subject: 'Halo test send',
            providerMessageId: receipt.providerMessageId,
            provider: receipt.provider,
          } as Prisma.InputJsonObject,
        },
      });
      await this.audit.log({
        accountId,
        userId,
        action: 'communications.test_send',
        resource: `message:${message.id}`,
        details: { to: maskEmail(address), provider: receipt.provider },
      });
      return {
        messageId: message.id,
        sent: true,
        provider: receipt.provider,
        providerMessageId: receipt.providerMessageId,
      };
    } catch (err) {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'failed' },
      });
      await this.audit.log({
        accountId,
        userId,
        action: 'communications.test_send',
        resource: `message:${message.id}`,
        details: { to: maskEmail(address), error: (err as Error).message },
      });
      throw new BadRequestException(
        `The test send failed: ${(err as Error).message}`,
      );
    }
  }

  /** The suppression list: everyone Halo must not contact, masked. */
  async suppressions(
    accountId: string,
    q: { source?: string; limit?: number },
  ) {
    const rows = await this.prisma.dNCList.findMany({
      where: { accountId, ...(q.source ? { source: q.source } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(q.limit ?? 100, 500),
    });
    const counts = await this.prisma.dNCList.groupBy({
      by: ['source'],
      where: { accountId },
      _count: { _all: true },
    });
    return {
      counts: Object.fromEntries(counts.map((c) => [c.source, c._count._all])),
      entries: rows.map((r) => ({
        id: r.id,
        channel: r.emailEnc ? 'email' : 'sms',
        contact: r.emailEnc
          ? maskEmail(openValue(r.emailEnc))
          : r.phoneEnc
            ? maskPhone(openValue(r.phoneEnc))
            : null,
        source: r.source,
        reason: r.reason,
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        removable: !RECIPIENT_OPT_OUTS.has(r.source),
      })),
    };
  }

  async suppress(
    accountId: string,
    userId: string,
    input: { email?: string | null; phone?: string | null; reason: string },
  ) {
    if (!input.email && !input.phone)
      throw new BadRequestException('Give an email address or a phone number.');
    if (input.email) {
      await this.optOut.recordEmailOptOut({
        accountId,
        email: input.email,
        source: 'manual',
        reason: input.reason,
      });
    }
    if (input.phone) {
      await this.optOut.recordPhoneOptOut({
        accountIds: [accountId],
        phone: input.phone,
        source: 'manual',
        reason: input.reason,
      });
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'communications.suppress',
      resource: 'dnc_list',
      details: {
        email: input.email ? maskEmail(input.email) : null,
        phone: input.phone ? maskPhone(input.phone) : null,
        reason: input.reason,
      },
    });
    return { suppressed: true };
  }

  /**
   * Remove an entry an operator or a bounce created. An opt-out the
   * recipient made (unsubscribe, STOP, complaint) cannot be removed here:
   * only the recipient can undo it.
   */
  async unsuppress(
    accountId: string,
    userId: string,
    id: string,
    reason: string,
  ) {
    const row = await this.prisma.dNCList.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('Entry not found');
    if (RECIPIENT_OPT_OUTS.has(row.source)) {
      throw new ForbiddenException(
        'The recipient opted out themselves; only a new request from them can reverse it.',
      );
    }
    await this.prisma.dNCList.delete({ where: { id: row.id } });
    await this.audit.log({
      accountId,
      userId,
      action: 'communications.unsuppress',
      resource: `dnc:${row.id}`,
      details: { source: row.source, reason },
    });
    return { removed: true };
  }

  /** Delivery over the last `days`: sends, deliveries, bounces, complaints, and the rates providers watch. */
  async deliverability(accountId: string, days = 30) {
    const since = new Date(Date.now() - days * 86_400_000);
    const [byStatus, events] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['status'],
        where: {
          accountId,
          channel: 'email',
          direction: 'outbound',
          createdAt: { gte: since },
        },
        _count: { _all: true },
      }),
      this.prisma.messageEvent.groupBy({
        by: ['event', 'bounceType'],
        where: { accountId, occurredAt: { gte: since } },
        _count: { _all: true },
      }),
    ]);
    const status = (s: string) =>
      byStatus.find((x) => x.status === s)?._count._all ?? 0;
    const ev = (e: string, b?: string) =>
      events
        .filter((x) => x.event === e && (b === undefined || x.bounceType === b))
        .reduce((n, x) => n + x._count._all, 0);
    const sent = status('sent') + status('delivered') + status('failed');
    const hardBounces = ev('bounce', 'hard') + ev('dropped');
    const complaints = ev('complaint');
    const bounceRate = sent ? hardBounces / sent : null;
    const complaintRate = sent ? complaints / sent : null;
    const warnings: string[] = [];
    if (bounceRate != null && bounceRate > 0.02)
      warnings.push(
        `Hard bounces are ${(bounceRate * 100).toFixed(1)}% of sends; providers act above about 2%. Clean the list before sending more.`,
      );
    if (complaintRate != null && complaintRate > 0.001)
      warnings.push(
        `Complaints are ${(complaintRate * 100).toFixed(2)}% of sends; mailbox providers act above about 0.1%.`,
      );
    return {
      days,
      sent,
      delivered: status('delivered'),
      blocked: status('blocked'),
      hardBounces,
      softBounces: ev('bounce', 'soft'),
      complaints,
      unsubscribes: ev('unsubscribe'),
      opens: ev('open'),
      clicks: ev('click'),
      bounceRate,
      complaintRate,
      warnings,
    };
  }

  // ------------------------------------------------------------ seller consent

  async leadConsents(accountId: string, leadId: string) {
    await this.lead(accountId, leadId);
    const rows = await this.prisma.consent.findMany({
      where: { accountId, leadId },
      orderBy: { grantedAt: 'desc' },
    });
    return rows.map((c) => ({
      id: c.id,
      channel: c.channel,
      source: c.source,
      evidence: c.evidence,
      grantedAt: c.grantedAt,
      revokedAt: c.revokedAt,
    }));
  }

  /**
   * Record a seller's consent to be contacted, with its evidence. Refused
   * for a contact on the do-not-contact list: an opt-out is reversed only by
   * the person who made it.
   */
  async recordLeadConsent(
    accountId: string,
    leadId: string,
    userId: string,
    input: {
      channel: 'email' | 'sms' | 'call';
      source: string;
      evidence: string;
      documentId?: string | null;
    },
  ) {
    const lead = await this.lead(accountId, leadId);
    const email = input.channel === 'email';
    const hash = email ? lead.canonicalEmailHash : lead.canonicalPhoneHash;
    const enc = email ? lead.canonicalEmailEnc : lead.canonicalPhoneEnc;
    if (!hash || !enc)
      throw new BadRequestException(
        `The lead has no ${email ? 'email address' : 'phone number'} on file.`,
      );
    const optedOut = await this.prisma.dNCList.findFirst({
      where: {
        accountId: { in: [accountId, 'GLOBAL'] },
        ...(email ? { emailHash: hash } : { phoneHash: hash }),
      },
      select: { id: true },
    });
    if (optedOut) {
      throw new BadRequestException(
        'This contact asked not to be contacted. Consent cannot override an opt-out; only a new request from them can.',
      );
    }
    if (input.documentId) {
      const doc = await this.prisma.document.findFirst({
        where: { id: input.documentId, accountId, status: 'active' },
        select: { id: true },
      });
      if (!doc)
        throw new BadRequestException('That document is not in the library.');
    }
    const consent = await this.prisma.consent.create({
      data: {
        accountId,
        leadId,
        channel: input.channel,
        source: input.source,
        evidence: {
          statement: input.evidence,
          documentId: input.documentId ?? null,
          recordedBy: userId,
        } as Prisma.InputJsonObject,
        ...(email
          ? { emailHash: hash, emailEnc: enc }
          : { phoneHash: hash, phoneEnc: enc }),
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'lead.consent.record',
      resource: `lead:${leadId}`,
      details: {
        consentId: consent.id,
        channel: input.channel,
        source: input.source,
      },
    });
    return { consentId: consent.id };
  }

  async revokeLeadConsent(
    accountId: string,
    leadId: string,
    consentId: string,
    userId: string,
  ) {
    const c = await this.prisma.consent.findFirst({
      where: { id: consentId, accountId, leadId },
    });
    if (!c) throw new NotFoundException('Consent not found');
    await this.prisma.consent.update({
      where: { id: c.id },
      data: { revokedAt: new Date() },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'lead.consent.revoke',
      resource: `lead:${leadId}`,
      details: { consentId },
    });
    return { revoked: true };
  }

  private async lead(accountId: string, leadId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, accountId },
      select: {
        id: true,
        canonicalEmailHash: true,
        canonicalEmailEnc: true,
        canonicalPhoneHash: true,
        canonicalPhoneEnc: true,
      },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }
}
