import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { CurrentAccountId } from '../auth/decorators';
import { InternalAuthGuard } from './internal-auth.guard';
import { OpenAIService } from '../integrations/openai/openai.service';
import { GeocodingService } from '../integrations/geocoding/geocoding.service';
import { AttomService } from '../integrations/attom/attom.service';
import { PrismaService } from '../prisma.service';
import type { CostContext } from '../cost-control/dto/cost-intent.dto';
import {
  ChatCompletionDto,
  CostAttributionDto,
  EnrichmentAddressDto,
  SkipTraceLeadDto,
} from './dto/internal.dto';
import { MessageDispatchService } from '../communications/message-dispatch.service';
import { LeadSkipTraceService } from '../skip-trace/lead-skip-trace.service';
import { AnthropicService } from '../integrations/anthropic/anthropic.service';
import { aiProviderForModel } from '@halo/shared';

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
 * Nothing here takes a recipient or message text: the only send is
 * `messages/:id/send`, which sends a stored, approved Message. The token
 * holder can name a tenant, so a route that accepted a raw `to` let it
 * message anyone outside the approval flow; those routes are gone.
 *
 * NOT for public consumption — see InternalAuthGuard.
 */
@SkipThrottle()
@Controller('internal')
@UseGuards(InternalAuthGuard)
export class InternalController {
  constructor(
    private readonly openai: OpenAIService,
    private readonly anthropic: AnthropicService,
    private readonly dispatch: MessageDispatchService,
    private readonly leadSkipTrace: LeadSkipTraceService,
    private readonly geocoding: GeocodingService,
    private readonly attom: AttomService,
    private readonly prisma: PrismaService,
  ) {}

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
    // The model name picks the adapter (claude-* -> Anthropic). Both run the
    // same cost-control preflight and write the same ledger, so callers are
    // provider-agnostic.
    const request = {
      model: dto.model,
      messages: dto.messages,
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
    };
    const result =
      aiProviderForModel(dto.model) === 'anthropic'
        ? await this.anthropic.chatCompletion(
            request,
            this.context(accountId, dto),
          )
        : await this.openai.chatCompletion(
            request,
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
   * Sends an approved message of this tenant. The recipient, body and
   * sender all come from the stored message and server config; see
   * MessageDispatchService for the checks (approved, outbound, DNC,
   * consent, quiet hours, control plane) and the opt-out text it adds.
   */
  @Post('messages/:messageId/send')
  async sendMessage(
    @CurrentAccountId() accountId: string,
    @Param('messageId') messageId: string,
  ) {
    return this.dispatch.sendApproved(accountId, messageId);
  }

  /**
   * Skip trace for the worker's enrichment funnel. The api finds and stores
   * the contacts (encrypted, on the lead); the worker gets counts only. The
   * worker used to call the Descope-guarded /skip-trace route with this
   * token, got a 401 and silently skipped the step.
   */
  @Post('enrichment/skip-trace')
  async skipTrace(
    @CurrentAccountId() accountId: string,
    @Body() dto: SkipTraceLeadDto,
  ) {
    const summary = await this.leadSkipTrace.traceLead({
      accountId,
      leadId: dto.leadId,
      actor: 'system',
      automated: true,
    });
    return {
      provider: summary.provider,
      status: summary.status,
      reason: summary.reason,
      costUsd: summary.costUsd,
      phonesFound: summary.phones.length,
      emailsFound: summary.emails.length,
      stored: summary.stored,
    };
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
