import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';

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
  private _client: OpenAI | null = null;

  constructor(private costControl: IntegrationCostControlService) {}

  private get client(): OpenAI {
    if (!this._client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error('OPENAI_API_KEY is required');
      this._client = new OpenAI({ apiKey });
    }
    return this._client;
  }

  async chatCompletion(input: ChatCompletionInput, ctx: CostContext): Promise<ChatCompletionResult | null> {
    const action = `chat_completion.${input.model}`;
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
      execute: async () => {
        const completion = await this.client.chat.completions.create({
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
      },
      computeActualCostUsd: (result) => priceFromTokens(input.model, result.tokensIn, result.tokensOut),
    });
    return (out.result as ChatCompletionResult | null) ?? null;
  }
}

// Cheap heuristic — assumes ~4 characters per token. Good enough for the
// preflight estimate; the real token count from `usage` overrides it.
function estimateTokensIn(messages: { content: string }[]): number {
  return Math.ceil(messages.reduce((s, m) => s + m.content.length, 0) / 4);
}

// Mirrors the per-1k pricing rules in `seed-providers.ts`. Centralized here
// so model rollouts only need a single source-of-truth update (seed +
// adapter), and the actual cost can be computed without re-querying the
// pricing table.
const TOKEN_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
};

function priceFromTokens(model: string, tokensIn: number, tokensOut: number): number {
  const p = TOKEN_PRICING[model] ?? TOKEN_PRICING['gpt-4o-mini'];
  return (tokensIn / 1000) * p.input + (tokensOut / 1000) * p.output;
}
