import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentAccountId } from '../auth/decorators';
import { InternalAuthGuard } from './internal-auth.guard';
import { OpenAIService } from '../integrations/openai/openai.service';
import { TwilioSendService } from '../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../integrations/email/email-send.service';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { assertPolicy, PolicyViolationError } from '@halo/shared';
import {
  ChatCompletionDto,
  CostAttributionDto,
  SendEmailDto,
  SendSmsDto,
} from './dto/internal.dto';

/**
 * Service-to-service surface for the worker.
 *
 * The worker used to call the OpenAI and Twilio SDKs directly, which meant
 * every token and every SMS segment it spent bypassed the cost-control
 * decision tree entirely — no budget check, no ledger row, no cap. These
 * routes re-expose the same cost-aware adapters the api already uses, so
 * worker spend is preflighted and recorded like everything else.
 *
 * Blocked calls surface as HTTP 429 `COST_BLOCKED` (see
 * CostBlockedException) rather than an empty success.
 *
 * NOT for public consumption — see InternalAuthGuard.
 */
@SkipThrottle()
@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly openai: OpenAIService,
    private readonly twilio: TwilioSendService,
    private readonly email: EmailSendService,
    private readonly compliance: ComplianceService,
  ) {}

  /**
   * Re-evaluates DNC / consent / quiet hours immediately before the provider
   * call. The same rules run when a message is drafted, but approval and
   * delivery are separated by a queue: a message approved at 16:00 can be
   * delivered at 23:00 after a retry or backlog, and a contact can reply STOP
   * in between. Only the check at this point reflects the state at send time.
   */
  private async assertSendable(params: {
    accountId: string;
    channel: 'sms' | 'email';
    phone?: string;
    email?: string;
    leadId?: string;
    dealId?: string;
    messageId?: string;
  }) {
    const facts = await this.compliance.getFacts({
      accountId: params.accountId,
      channel: params.channel,
      phone: params.phone,
      email: params.email,
      leadId: params.leadId,
    });

    try {
      assertPolicy({
        tenantId: params.accountId,
        actorId: null,
        actorType: 'system',
        now: new Date(),
        requestedAction:
          params.channel === 'sms' ? 'comms.send_sms' : 'comms.send_email',
        channel: params.channel,
        leadId: params.leadId,
        dealId: params.dealId,
        messageId: params.messageId,
        ...facts,
      });
    } catch (err) {
      if (err instanceof PolicyViolationError) {
        throw new ComplianceBlockedException(err.code, err.reason, {
          channel: params.channel,
          ...(facts.timezone ? { timezone: facts.timezone } : {}),
          ...(typeof facts.localHour === 'number'
            ? { localHour: facts.localHour }
            : {}),
        });
      }
      throw err;
    }
  }

  private context(accountId: string, dto: CostAttributionDto): CostContext {
    return {
      accountId,
      actor: 'system',
      leadId: dto.leadId,
      propertyId: dto.propertyId,
      dealId: dto.dealId,
      campaignId: dto.campaignId,
      automationRunId: dto.automationRunId,
    };
  }

  @Post('ai/chat-completion')
  async chatCompletion(
    @CurrentAccountId() accountId: string,
    @Body() dto: ChatCompletionDto,
  ) {
    const result = await this.openai.chatCompletion(
      {
        model: dto.model,
        messages: dto.messages,
        temperature: dto.temperature,
        maxTokens: dto.maxTokens,
      },
      this.context(accountId, dto),
    );

    // `raw` carries the full provider response; the worker only needs the
    // content and token counts, and shipping it doubles the payload.
    return result
      ? {
          content: result.content,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          model: result.model,
        }
      : null;
  }

  @Post('sms/send')
  async sendSms(
    @CurrentAccountId() accountId: string,
    @Body() dto: SendSmsDto,
  ) {
    await this.assertSendable({
      accountId,
      channel: 'sms',
      phone: dto.to,
      leadId: dto.leadId,
      dealId: dto.dealId,
      messageId: dto.messageId,
    });

    return this.twilio.sendSms(
      {
        to: dto.to,
        from: dto.from,
        body: dto.body,
        variant: dto.variant,
        messageId: dto.messageId,
      },
      this.context(accountId, dto),
    );
  }

  @Post('email/send')
  async sendEmail(
    @CurrentAccountId() accountId: string,
    @Body() dto: SendEmailDto,
  ) {
    await this.assertSendable({
      accountId,
      channel: 'email',
      email: dto.to,
      leadId: dto.leadId,
      dealId: dto.dealId,
      messageId: dto.messageId,
    });

    return this.email.sendEmail(
      {
        to: dto.to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
        from: dto.from,
        messageId: dto.messageId,
      } as any,
      this.context(accountId, dto),
    );
  }
}
