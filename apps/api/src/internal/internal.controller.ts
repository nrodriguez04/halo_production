import {
  BadRequestException,
  Body,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentAccountId } from '../auth/decorators';
import { InternalAuthGuard } from './internal-auth.guard';
import { OpenAIService } from '../integrations/openai/openai.service';
import { TwilioSendService } from '../integrations/twilio-send/twilio-send.service';
import { EmailSendService } from '../integrations/email/email-send.service';
import { GeocodingService } from '../integrations/geocoding/geocoding.service';
import { AttomService } from '../integrations/attom/attom.service';
import { PrismaService } from '../prisma.service';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import { ComplianceService } from '../compliance/compliance.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { assertPolicy, PolicyViolationError } from '@halo/shared';
import {
  ChatCompletionDto,
  CostAttributionDto,
  EnrichmentAddressDto,
  SendEmailDto,
  SendSmsDto,
} from './dto/internal.dto';
import { messageCounterparty } from '../communications/message-counterparty';

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
    private readonly geocoding: GeocodingService,
    private readonly attom: AttomService,
    private readonly prisma: PrismaService,
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

  /**
   * The worker sends by messageId and never sees the recipient: it is read
   * from the message's encrypted counterparty here (metadata only for rows
   * the backfill has not reached). An explicit `to` is still accepted for
   * sends that have no message row.
   */
  private async recipientFor(
    accountId: string,
    channel: 'sms' | 'email',
    dto: { to?: string; messageId?: string },
  ): Promise<string> {
    if (dto.to) return dto.to;
    if (dto.messageId) {
      const message = await this.prisma.message.findFirst({
        where: { id: dto.messageId, accountId },
        select: {
          channel: true,
          direction: true,
          metadata: true,
          counterpartyEnc: true,
        },
      });
      const recipient = message ? messageCounterparty(message) : null;
      if (recipient) return recipient;
    }
    throw new BadRequestException(
      `No ${channel} recipient: pass \`to\` or a messageId with a stored counterparty`,
    );
  }

  @Post('sms/send')
  async sendSms(
    @CurrentAccountId() accountId: string,
    @Body() dto: SendSmsDto,
  ) {
    const to = await this.recipientFor(accountId, 'sms', dto);
    await this.assertSendable({
      accountId,
      channel: 'sms',
      phone: to,
      leadId: dto.leadId,
      dealId: dto.dealId,
      messageId: dto.messageId,
    });

    return this.twilio.sendSms(
      {
        to,
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
    const to = await this.recipientFor(accountId, 'email', dto);
    await this.assertSendable({
      accountId,
      channel: 'email',
      email: to,
      leadId: dto.leadId,
      dealId: dto.dealId,
      messageId: dto.messageId,
    });

    return this.email.sendEmail(
      {
        to,
        subject: dto.subject,
        text: dto.text,
        html: dto.html,
        from: dto.from,
        messageId: dto.messageId,
      } as any,
      this.context(accountId, dto),
    );
  }

  /**
   * Enrichment lookups. These were the last paid calls the worker still
   * made directly (raw fetch plus a best-effort ledger row of its own), so
   * they ran outside preflight, rate limits and the idempotency window.
   * The api's adapters store the SourceRecord; the route links it to the
   * lead the worker is enriching, as the worker used to.
   */
  @Post('enrichment/geocode')
  async geocode(
    @CurrentAccountId() accountId: string,
    @Body() dto: EnrichmentAddressDto,
  ) {
    const out = await this.geocoding.geocodeDetailed(
      dto.address,
      dto.city,
      dto.state,
      dto.zip,
      this.context(accountId, dto),
    );
    return this.enrichmentResponse(out, dto.leadId);
  }

  @Post('enrichment/property-lookup')
  async propertyLookup(
    @CurrentAccountId() accountId: string,
    @Body() dto: EnrichmentAddressDto,
  ) {
    const out = await this.attom.lookupPropertyDetailed(
      dto.address,
      dto.city,
      dto.state,
      dto.zip,
      this.context(accountId, dto),
    );
    return this.enrichmentResponse(out, dto.leadId);
  }

  private async enrichmentResponse(
    out: {
      result: { sourceRecordId: string | null } | null;
      costUsd: number;
      cached: boolean;
    },
    leadId?: string,
  ) {
    const sourceRecordId = out.result?.sourceRecordId ?? null;
    if (sourceRecordId && leadId) {
      await this.prisma.sourceRecord.updateMany({
        where: { id: sourceRecordId, leadId: null },
        data: { leadId },
      });
    }
    return { sourceRecordId, costUsd: out.costUsd, cached: out.cached };
  }
}
