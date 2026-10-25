import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { senderOf } from './sender';

// Cost-aware email adapter. Provider preference, in order:
//   1. SendGrid when USE_SENDGRID=true (key from the integration-secrets
//      store, so a key entered on the admin page works as well as env)
//   2. Resend when RESEND_API_KEY is set
//   3. SMTP (MailHog in dev, configurable in prod)
// Over-budget fallback is the cost-control service's own DOWNGRADE_PROVIDER
// mechanism: sendgrid and resend both chain to smtp in fallback-chain.ts,
// so inside this service we only dispatch by `resolved.provider`.

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  /** Extra headers, e.g. List-Unsubscribe / List-Unsubscribe-Post. */
  headers?: Record<string, string>;
  /** Where replies go (the Inbound Parse subdomain); docs/integrations/email-inbound.md. */
  replyTo?: string;
  messageId?: string;
}

export type EmailProvider = 'sendgrid' | 'resend' | 'smtp';

export { senderOf };

/** `"Name" <address>`, or the bare address, for the string-based providers. */
function senderHeader(sender: { email: string; name?: string }): string {
  return sender.name
    ? `"${sender.name.replace(/"/g, '')}" <${sender.email}>`
    : sender.email;
}

export interface SendEmailResult {
  messageId: string;
  provider: EmailProvider;
}

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);
  private _smtp: nodemailer.Transporter | null = null;

  constructor(
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  private preferredProvider(): EmailProvider {
    if (process.env.USE_SENDGRID === 'true') return 'sendgrid';
    if (process.env.RESEND_API_KEY) return 'resend';
    return 'smtp';
  }

  private get smtp(): nodemailer.Transporter {
    if (!this._smtp) {
      this._smtp = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '1025', 10),
        secure: false,
      });
    }
    return this._smtp;
  }

  async sendEmail(
    input: SendEmailInput,
    ctx: CostContext,
  ): Promise<SendEmailResult | null> {
    const out = await this.costControl.checkAndCall<
      SendEmailInput,
      SendEmailResult
    >({
      provider: this.preferredProvider(),
      action: 'send_email',
      payload: input,
      context: ctx,
      hints: input.messageId
        ? { idempotencyKey: `email:${input.messageId}` }
        : undefined,
      execute: async (resolved) => {
        if (resolved.provider === 'sendgrid') {
          return this.sendViaSendGrid(input);
        }
        if (resolved.provider === 'resend') {
          return this.sendViaResend(input);
        }
        return this.sendViaSmtp(input);
      },
    });
    return (out.result as SendEmailResult | null) ?? null;
  }

  private async sendViaSendGrid(
    input: SendEmailInput,
  ): Promise<SendEmailResult> {
    const apiKey = await this.secrets.resolve('sendgrid', 'SENDGRID_API_KEY');
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'sendgrid',
        'SENDGRID_API_KEY',
      );
    }
    // SendGrid only accepts verified senders; a configured sender wins over
    // whatever the caller put in `from`.
    const from = senderOf(process.env.SENDGRID_FROM_EMAIL || input.from);
    const content: Array<{ type: string; value: string }> = [];
    if (input.text) content.push({ type: 'text/plain', value: input.text });
    if (input.html) content.push({ type: 'text/html', value: input.html });
    if (content.length === 0) content.push({ type: 'text/plain', value: '' });

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: input.to }] }],
        from,
        ...(input.replyTo ? { reply_to: { email: input.replyTo } } : {}),
        subject: input.subject,
        content,
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.messageId
          ? { custom_args: { halo_message_id: input.messageId } }
          : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `SendGrid send failed: ${res.status} ${res.statusText}${detail ? ` - ${detail.slice(0, 200)}` : ''}`,
      );
    }
    // 202 Accepted with the provider id in a header; no body.
    const messageId =
      res.headers.get('x-message-id') ||
      `sendgrid:${input.messageId ?? Date.now()}`;
    return { messageId, provider: 'sendgrid' };
  }

  private async sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'resend',
        'RESEND_API_KEY',
      );
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: senderHeader(senderOf(input.from)),
        to: input.to,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        subject: input.subject,
        text: input.text,
        html: input.html,
        ...(input.headers ? { headers: input.headers } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { id: string };
    return { messageId: data.id, provider: 'resend' };
  }

  private async sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
    const sender = senderOf(input.from);
    const result = await this.smtp.sendMail({
      from: sender.name
        ? { name: sender.name, address: sender.email }
        : sender.email,
      to: input.to,
      ...(input.replyTo ? { replyTo: input.replyTo } : {}),
      subject: input.subject,
      text: input.text,
      html: input.html,
      headers: input.headers,
    });
    return { messageId: result.messageId, provider: 'smtp' };
  }
}
