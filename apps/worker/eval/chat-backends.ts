import { chatCompletion } from '../src/internal-api.client';
import type { ChatFn } from './golden-eval';

/**
 * Live backends for the golden set. `api` is the production path: the
 * api's internal chat route with the tenant's keys, cost control and the
 * OpenAI / Anthropic routing by model name. It needs the worker's
 * INTERNAL_API_BASE_URL and INTERNAL_API_TOKEN and a tenant id. `openai`
 * calls OpenAI directly with OPENAI_API_KEY, for CI where no api runs; it
 * sends the same parameters as the api's OpenAI adapter. Claude models need
 * `api`. Neither is ever used by the worker itself.
 */
export function apiChat(): ChatFn {
  return (accountId, input) =>
    chatCompletion(accountId, {
      ...input,
      // Golden cases name leads and deals that do not exist: keep the spend
      // off them and out of the agents' own budget buckets.
      leadId: undefined,
      dealId: undefined,
      propertyId: undefined,
      automationRunId: undefined,
      workflow: 'agent:eval',
    });
}

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function openAiChat(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): ChatFn {
  return async (_accountId, input) => {
    if (/^claude-/i.test(input.model)) {
      throw new Error(
        `--via openai cannot call ${input.model}; evaluate Claude tiers with --via api`,
      );
    }
    const res = await fetchImpl(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature,
        max_tokens: input.maxTokens,
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenAI answered ${res.status}: ${text.slice(0, 300)}`);
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      content: body.choices?.[0]?.message?.content ?? '',
      model: body.model ?? input.model,
      tokensIn: body.usage?.prompt_tokens ?? 0,
      tokensOut: body.usage?.completion_tokens ?? 0,
    };
  };
}
