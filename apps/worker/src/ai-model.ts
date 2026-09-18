// Single source of truth for which chat model the worker asks for, and what
// it costs. The processors previously hardcoded 'gpt-4' in five places.
//
// The authoritative ledger is `integration_cost_events`, written api-side by
// the cost-control service when the worker calls /internal/ai/chat-completion.
// These rates only produce the per-result cost the worker records in job
// metadata for display, so they must stay in step with TOKEN_PRICING in
// apps/api/src/integrations/openai/openai.service.ts.

export const AI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

const RATES_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
};

export function estimateAiCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const rate = RATES_PER_1K[model] ?? RATES_PER_1K['gpt-4o'];
  return (tokensIn / 1000) * rate.input + (tokensOut / 1000) * rate.output;
}
