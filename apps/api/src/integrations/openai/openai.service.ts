import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import { IntegrationUnavailableException } from '../integration-unavailable.exception';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';

// Cost-aware OpenAI adapter. Both api routes and worker processors call into
// this single service so every chat completion is recorded in
// `integration_cost_events` and counted against the OpenAI monthly cap.
//
// We register one pricing rule per (model, direction) combo in the seed
// (`openai.chat_completion.<model>` with `unit=per_1k_input_tokens` and
// `unit=per_1k_output_tokens`). The pricing service sums them so a single
// completion produces a single intent + one row in the ledger.

export interface ChatCompletionInput {
  model: string;
  /** Workflow-scoped budget bucket (e.g. agent:lead_analyst); see cost-control hints. */
  workflow?: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
  // Approximate token estimate for the preflight cost check. Used when we
  // can't know the real count without a tokenizer call.
  estimatedTokensIn?: number;
  estimatedTokensOut?: number;
}

export interface ChatCompletionResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  raw: OpenAI.Chat.Completions.ChatCompletion;
}

@Injectable()
export class OpenAIService {
  private readonly logger = new Logger(OpenAIService.name);
  /** One SDK client per key value, so a key changed on the Integrations page takes effect at once. */
  private readonly clients = new Map<string, OpenAI>();

  constructor(
    private costControl: IntegrationCostControlService,
    private secrets: IntegrationSecretsService,
  ) {}

  private async client(): Promise<OpenAI> {
    const apiKey = await this.secrets.resolve('openai', 'OPENAI_API_KEY');
    if (!apiKey) {
      throw IntegrationUnavailableException.notConfigured(
        'openai',
        'OPENAI_API_KEY',
      );
    }
    let client = this.clients.get(apiKey);
    if (!client) {
      client = new OpenAI({ apiKey });
      this.clients.set(apiKey, client);
    }
    return client;
  }

  async chatCompletion(
    input: ChatCompletionInput,
    ctx: CostContext,
  ): Promise<ChatCompletionResult | null> {
    const action = `chat_completion.${input.model}`;
    // A missing key fails here, before any budget is reserved.
    const client = await this.client();
    const out = await this.costControl.checkAndCall<
      ChatCompletionInput & { tokensIn: number; tokensOut: number },
      ChatCompletionResult
    >({
      provider: 'openai',
      action,
      payload: {
        ...input,
        // Token estimates feed the per-1k pricing rule. Real counts replace
        // the estimate via computeActualCostUsd below.
        tokensIn: input.estimatedTokensIn ?? estimateTokensIn(input.messages),
        tokensOut: input.estimatedTokensOut ?? input.maxTokens ?? 256,
      },
      context: ctx,
      hints: input.workflow ? { workflow: input.workflow } : undefined,
      execute: async () => {
        try {
          const completion = await client.chat.completions.create({
            model: input.model,
            messages: input.messages,
            temperature: input.temperature,
            max_tokens: input.maxTokens,
          });
          return {
            content: completion.choices[0]?.message?.content ?? '',
            tokensIn: completion.usage?.prompt_tokens ?? 0,
            tokensOut: completion.usage?.completion_tokens ?? 0,
            model: completion.model,
            raw: completion,
          };
        } catch (err) {
          throw mapOpenAIError(err);
        }
      },
      computeActualCostUsd: (result) =>
        priceFromTokens(input.model, result.tokensIn, result.tokensOut),
    });
    return (out.result as ChatCompletionResult | null) ?? null;
  }
}

/**
 * Credentials and quota problems are configuration states, not crashes: a
 * 503 that names the provider and the reason, never a bare 500.
 */
function mapOpenAIError(err: unknown): Error {
  if (
    err instanceof OpenAI.AuthenticationError ||
    err instanceof OpenAI.PermissionDeniedError
  ) {
    return new IntegrationUnavailableException(
      'openai',
      'REJECTED_CREDENTIALS',
      (err as Error).message,
    );
  }
  // 429 covers both rate limits and "no credits remaining".
  if (err instanceof OpenAI.RateLimitError) {
    return new IntegrationUnavailableException(
      'openai',
      'UPSTREAM_ERROR',
      (err as Error).message,
    );
  }
  if (err instanceof OpenAI.APIError && (err.status ?? 0) >= 500) {
    return new IntegrationUnavailableException(
      'openai',
      'UPSTREAM_ERROR',
      (err as Error).message,
    );
  }
  return err as Error;
}

// Cheap heuristic — assumes ~4 characters per token. Good enough for the
// preflight estimate; the real token count from `usage` overrides it.
function estimateTokensIn(messages: { content: string }[]): number {
  return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
}

// Mirrors the per-1k pricing rules in `cost-control/seed-providers.ts`. Centralized here
// so model rollouts only need a single source-of-truth update (seed +
// adapter), and the actual cost can be computed without re-querying the
// pricing table.
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  // Legacy gpt-4 is ~20x gpt-4o. It was missing here while the worker
  // hardcoded it, so every such call silently fell through to the
  // gpt-4o-mini default below and under-billed by roughly 200x.
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
};

function priceFromTokens(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = TOKEN_PRICING[model] ?? TOKEN_PRICING['gpt-4o-mini'];
  return (tokensIn / 1000) * p.input + (tokensOut / 1000) * p.output;
}
