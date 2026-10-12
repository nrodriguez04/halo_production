import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';

// Cost-aware Anthropic adapter, the Claude counterpart of OpenAIService. The
// internal AI route picks the adapter from the model name, so worker
// processors and agents never see a provider: every completion goes through
// `checkAndCall`, lands in `integration_cost_events`, and counts against the
// tenant's AI budget buckets the same way an OpenAI call does.
//
// Pricing is one rule per (model, direction) in seed-providers
// (`anthropic.chat_completion.<model>` with `per_1k_input_tokens` /
// `per_1k_output_tokens`); TOKEN_PRICING below mirrors it for the actual
// cost once the real token counts are known.

export interface AnthropicChatInput {
  model: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
  estimatedTokensIn?: number;
  estimatedTokensOut?: number;
}

export interface AnthropicChatResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  /** `end_turn`, `max_tokens`, `refusal`, ... as reported by the API. */
  stopReason: string | null;
  raw: Anthropic.Beta.BetaMessage;
}

/**
 * Models that still accept sampling parameters. On the 4.7+ Opus line, the
 * 5.x line and Sonnet 5.5 a `temperature` is rejected with a 400, so it is
 * only forwarded where the API takes it.
 */
function acceptsSampling(model: string): boolean {
  return /^claude-(haiku-4-5|opus-4-6|sonnet-4-6|3-)/.test(model);
}

/**
 * Models with safety classifiers that can decline a request. Server-side
 * fallbacks re-run a declined request on another model inside the same
 * call, so a routine underwriting prompt is not lost to a false positive.
 */
function usesServerSideFallbacks(model: string): boolean {
  return /^claude-(opus-5|sonnet-5-5|fable-5)/.test(model);
}

@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);
  /** One SDK client per (key, workspace) pair, so a change on the Integrations page takes effect at once. */
  private readonly clients = new Map<string, Anthropic>();

  constructor(
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  private async client(): Promise<Anthropic> {
    const apiKey = await this.secrets.resolve('anthropic', 'ANTHROPIC_API_KEY');
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'anthropic',
        'ANTHROPIC_API_KEY',
      );
    }
    // Organization-level keys must name the workspace on every request.
    const workspaceId =
      (await this.secrets.resolve('anthropic', 'ANTHROPIC_WORKSPACE_ID')) ||
      undefined;
    const cacheKey = `${apiKey}|${workspaceId ?? ''}`;
    let client = this.clients.get(cacheKey);
    if (!client) {
      client = new Anthropic({
        apiKey,
        ...(workspaceId
          ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
          : {}),
      });
      this.clients.set(cacheKey, client);
    }
    return client;
  }

  async chatCompletion(
    input: AnthropicChatInput,
    ctx: CostContext,
  ): Promise<AnthropicChatResult | null> {
    const action = `chat_completion.${input.model}`;
    // A missing key fails here, before any budget is reserved.
    await this.client();
    const out = await this.costControl.checkAndCall<
      AnthropicChatInput & { tokensIn: number; tokensOut: number },
      AnthropicChatResult
    >({
      provider: 'anthropic',
      action,
      payload: {
        ...input,
        // Estimates feed the per-1k preflight; real counts replace them in
        // computeActualCostUsd. Output defaults deliberately low: the
        // estimate is what the budget check sees, and the worker's prompts
        // ask for short structured answers.
        tokensIn: input.estimatedTokensIn ?? estimateTokensIn(input.messages),
        tokensOut: input.estimatedTokensOut ?? input.maxTokens ?? 1024,
      },
      context: ctx,
      execute: () => this.complete(input),
      computeActualCostUsd: (result) =>
        priceFromTokens(input.model, result.tokensIn, result.tokensOut),
    });
    return (out.result as AnthropicChatResult | null) ?? null;
  }

  private async complete(
    input: AnthropicChatInput,
  ): Promise<AnthropicChatResult> {
    const client = await this.client();
    // OpenAI-style transcripts put the system prompt in the message list;
    // the Messages API takes it as a top-level field.
    const system = input.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n');
    const messages: Anthropic.MessageParam[] = input.messages
      .filter(
        (m): m is { role: 'user' | 'assistant'; content: string } =>
          m.role !== 'system',
      )
      .map((m) => ({ role: m.role, content: m.content }));

    const base = {
      model: input.model,
      max_tokens: input.maxTokens ?? 4096,
      ...(system ? { system } : {}),
      messages,
      ...(acceptsSampling(input.model) && typeof input.temperature === 'number'
        ? { temperature: input.temperature }
        : {}),
    };

    // One code path through the beta namespace: it accepts the plain request
    // too, and the fallbacks parameter only exists there.
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await client.beta.messages.create({
        ...base,
        ...(usesServerSideFallbacks(input.model)
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
          : {}),
      });
    } catch (err) {
      // 429 covers rate limits and "credit balance is too low".
      if (err instanceof Anthropic.RateLimitError) {
        throw new IntegrationUnavailableException(
          'anthropic',
          'UPSTREAM_ERROR',
          (err as Error).message,
        );
      }
      // Bad credentials are a configuration problem, not a transient failure:
      // surface them as 503 REJECTED_CREDENTIALS like the other adapters.
      if (
        err instanceof Anthropic.AuthenticationError ||
        err instanceof Anthropic.PermissionDeniedError
      ) {
        throw new IntegrationUnavailableException(
          'anthropic',
          'REJECTED_CREDENTIALS',
          err.message,
        );
      }
      throw err;
    }

    if (response.stop_reason === 'refusal') {
      this.logger.warn(
        `Anthropic declined a ${input.model} request (${response.stop_details?.category ?? 'uncategorised'})`,
      );
    }

    const content = response.content
      .filter(
        (block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text',
      )
      .map((block) => block.text)
      .join('');

    return {
      content,
      tokensIn: response.usage.input_tokens,
      tokensOut: response.usage.output_tokens,
      model: response.model,
      stopReason: response.stop_reason,
      raw: response,
    };
  }
}

// ~4 characters per token, the same heuristic the OpenAI adapter uses for
// the preflight estimate; the real count from `usage` overrides it.
function estimateTokensIn(messages: { content: string }[]): number {
  return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
}

// Per 1k tokens, mirroring the pricing rules in cost-control/seed-providers.ts.
export const ANTHROPIC_TOKEN_PRICING: Record<
  string,
  { input: number; output: number }
> = {
  'claude-fable-5-1': { input: 0.01, output: 0.05 },
  'claude-opus-5-5': { input: 0.004, output: 0.02 },
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-opus-4-8': { input: 0.005, output: 0.025 },
  'claude-sonnet-5-5': { input: 0.002, output: 0.01 },
  'claude-sonnet-5': { input: 0.002, output: 0.01 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
};

export function priceFromTokens(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  // An unknown model is priced at the Opus rate rather than the cheapest
  // one, so a typo in a model name over-counts spend instead of under-counting it.
  const p =
    ANTHROPIC_TOKEN_PRICING[model] ??
    ANTHROPIC_TOKEN_PRICING['claude-opus-5-5'];
  return (tokensIn / 1000) * p.input + (tokensOut / 1000) * p.output;
}
