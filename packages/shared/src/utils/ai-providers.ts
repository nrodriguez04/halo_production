/**
 * The model providers behind `POST /internal/ai/chat-completion`. Everything
 * that sums "AI spend" (cap checks, analytics, the worker's display cost)
 * must include every key here, or a tenant could spend through one provider
 * without the other's cap noticing.
 */
export const AI_PROVIDER_KEYS = ['openai', 'anthropic'] as const;
export type AiProviderKey = (typeof AI_PROVIDER_KEYS)[number];

/** Which adapter serves a model: `claude-*` is Anthropic, everything else OpenAI. */
export function aiProviderForModel(model: string): AiProviderKey {
  return model.startsWith('claude-') ? 'anthropic' : 'openai';
}

export const DEFAULT_AI_MODEL = 'gpt-4o';
