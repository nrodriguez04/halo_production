// Single source of truth for which chat model the worker asks for, and what
// it costs. The processors previously hardcoded 'gpt-4' in five places.
//
// The authoritative ledger is `integration_cost_events`, written api-side by
// the cost-control service when the worker calls /internal/ai/chat-completion.
// These rates only produce the per-result cost the worker records in job
// metadata for display, so they must stay in step with TOKEN_PRICING in
// apps/api/src/integrations/openai/openai.service.ts and
// ANTHROPIC_TOKEN_PRICING in apps/api/src/integrations/anthropic/anthropic.service.ts.

import { DEFAULT_AI_MODEL } from '@halo/shared';

// AI_MODEL may name an OpenAI or an Anthropic model; the api routes on the
// name. OPENAI_MODEL is honoured for existing deployments.
export const AI_MODEL =
  process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_AI_MODEL;

const RATES_PER_1K: Record<string, { input: number; output: number }> = {
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4o': { input: 0.0025, output: 0.01 },
  'gpt-4-turbo': { input: 0.01, output: 0.03 },
  'gpt-4': { input: 0.03, output: 0.06 },
  'gpt-4-32k': { input: 0.06, output: 0.12 },
  'claude-fable-5-1': { input: 0.01, output: 0.05 },
  'claude-opus-5-5': { input: 0.004, output: 0.02 },
  'claude-opus-5': { input: 0.005, output: 0.025 },
  'claude-sonnet-5-5': { input: 0.002, output: 0.01 },
  'claude-sonnet-5': { input: 0.002, output: 0.01 },
  'claude-haiku-4-5': { input: 0.001, output: 0.005 },
};

export function estimateAiCostUsd(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number {
  const rate = RATES_PER_1K[model] ?? RATES_PER_1K['gpt-4o'];
  return (tokensIn / 1000) * rate.input + (tokensOut / 1000) * rate.output;
}
