import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';

// Cost-aware email adapter. Tries Resend first (when RESEND_API_KEY is
// set), falls back to SMTP (MailHog in dev, configurable in prod). The
// fallback is the cost-control service's own DOWNGRADE_PROVIDER mechanism
// — we register `smtp` as the fallback for `resend` in the seed and trust
// the policy chain to route correctly when Resend is over budget. Inside
// this single service we only need to dispatch by `resolved.provider`.

export interface SendEmailInput {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
  messageId?: string;
}

export interface SendEmailResult {
  messageId: string;
  provider: 'resend' | 'smtp';
}

@Injectable()
export class EmailSendService {
  private readonly logger = new Logger(EmailSendService.name);
  private _smtp: nodemailer.Transporter | null = null;

  constructor(private costControl: IntegrationCostControlService) {}

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

  async sendEmail(input: SendEmailInput, ctx: CostContext): Promise<SendEmailResult | null> {
    const preferredProvider = process.env.RESEND_API_KEY ? 'resend' : 'smtp';
    const out = await this.costControl.checkAndCall<SendEmailInput, SendEmailResult>({
      provider: preferredProvider,
      action: 'send_email',
      payload: input,
      context: ctx,
      hints: input.messageId ? { idempotencyKey: `email:${input.messageId}` } : undefined,
      execute: async (resolved) => {
        if (resolved.provider === 'resend') {
          return this.sendViaResend(input);
        }
        return this.sendViaSmtp(input);
      },
    });
    return (out.result as SendEmailResult | null) ?? null;
  }

  private async sendViaResend(input: SendEmailInput): Promise<SendEmailResult> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is required for resend provider');
    }
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend send failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { id: string };
    return { messageId: data.id, provider: 'resend' };
  }

  private async sendViaSmtp(input: SendEmailInput): Promise<SendEmailResult> {
    const result = await this.smtp.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { messageId: result.messageId, provider: 'smtp' };
  }
}
