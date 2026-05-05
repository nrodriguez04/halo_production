import { Injectable, Logger } from '@nestjs/common';
import { Twilio } from 'twilio';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';

// Cost-aware Twilio outbound SMS adapter. Replaces the inline twilio.messages
// .create() call in the worker's CommunicationsProcessor. Pricing is
// per-segment (~$0.0083 for US 10DLC / toll-free); the segment count is
// estimated from `body.length / 153` for GSM-7 in the preflight, then
// corrected via Twilio's response in `numSegments`.

export interface SendSmsInput {
  to: string;
  from: string;
  body: string;
  /** 'us' for 10DLC / long-code, 'toll_free' for toll-free numbers */
  variant?: 'us' | 'toll_free';
  messageId?: string;
}

export interface SendSmsResult {
  sid: string;
  numSegments: number;
  status: string;
}

@Injectable()
export class TwilioSendService {
  private readonly logger = new Logger(TwilioSendService.name);
  private _client: Twilio | null = null;

  constructor(private costControl: IntegrationCostControlService) {}

  private get client(): Twilio {
    if (!this._client) {
      const sid = process.env.TWILIO_ACCOUNT_SID;
      const token = process.env.TWILIO_AUTH_TOKEN;
      if (!sid || !token) {
        throw new Error('TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are required');
      }
      this._client = new Twilio(sid, token);
    }
    return this._client;
  }

  async sendSms(input: SendSmsInput, ctx: CostContext): Promise<SendSmsResult | null> {
    const action = `send_sms.${input.variant ?? 'us'}`;
    const out = await this.costControl.checkAndCall<
      SendSmsInput & { segmentCount: number },
      SendSmsResult
    >({
      provider: 'twilio',
      action,
      payload: { ...input, segmentCount: estimateSegments(input.body) },
      context: ctx,
      hints: input.messageId ? { idempotencyKey: `sms:${input.messageId}` } : undefined,
      execute: async () => {
        const result = await this.client.messages.create({
          body: input.body,
          to: input.to,
          from: input.from,
        });
        return {
          sid: result.sid,
          numSegments: parseInt(String(result.numSegments ?? '1'), 10),
          status: result.status,
        };
      },
      computeActualCostUsd: (result) => result.numSegments * 0.0083,
    });
    return (out.result as SendSmsResult | null) ?? null;
  }
}

// GSM-7 packs 160 chars into a single segment, 153 chars in concatenated
// segments. UCS-2 (any non-GSM char) is 70 / 67. We pessimistically use
// 153 since most templates fit GSM-7; the actual count from Twilio
// overrides this estimate.
function estimateSegments(body: string): number {
  const len = body.length;
  if (len <= 160) return 1;
  return Math.ceil(len / 153);
}
