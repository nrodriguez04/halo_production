// A chat completion that may search the web (docs/agent-design.md s3.7):
// the Market Expansion agent's research route. Both adapters run it through
// the same cost-control preflight as a chat completion, under the action
// `web_research.<model>`, with each search priced on top of the tokens.

export interface WebResearchInput {
  model: string;
  /** Workflow-scoped budget bucket (e.g. agent:market_expansion). */
  workflow?: string;
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  temperature?: number;
  maxTokens?: number;
  /** The most searches the run may make (Anthropic enforces it; OpenAI's preview tool decides itself, so the preflight assumes this many). */
  maxSearches: number;
  /** Limits searches to these domains, where the provider supports it (Anthropic). */
  allowedDomains?: string[];
}

/** A page the provider's search returned or the reply cited from it. */
export interface WebResearchSource {
  url: string;
  title: string | null;
}

export interface WebResearchResult {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
  /** Searches the provider reports it ran. */
  searches: number;
  /** Every page the searches returned, once each. */
  sources: WebResearchSource[];
}

/**
 * Per search, in dollars, mirroring the `per_search` rules in
 * cost-control/seed-providers.ts: Anthropic's web search tool is $10 per
 * 1,000 searches, OpenAI's web_search_preview $25 per 1,000 calls.
 */
export const WEB_SEARCH_USD = { anthropic: 0.01, openai: 0.025 } as const;

/** Sources once each, by URL, in the order first seen. */
export function uniqueSources(list: WebResearchSource[]): WebResearchSource[] {
  const seen = new Set<string>();
  const out: WebResearchSource[] = [];
  for (const s of list) {
    if (!s.url || seen.has(s.url)) continue;
    seen.add(s.url);
    out.push(s);
  }
  return out;
}
