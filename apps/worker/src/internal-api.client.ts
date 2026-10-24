import type { AgentDecision, AgentEntityType } from '@halo/shared';
// Worker -> api client for paid operations.
//
// The worker cannot run IntegrationCostControlService itself (it is wired
// into the api's DI graph against the api's Prisma client), so every paid
// call is proxied to the api's `/internal/*` routes. That is what puts
// worker spend through the same preflight, budget buckets and ledger as
// everything else. Calling the OpenAI or Twilio SDK directly from a
// processor re-opens the hole this exists to close.

export class InternalApiNotConfiguredError extends Error {
  constructor() {
    super(
      'INTERNAL_API_BASE_URL / INTERNAL_API_TOKEN are required for the worker to make paid calls',
    );
    this.name = 'InternalApiNotConfiguredError';
  }
}

/** Raised when cost control suppressed the call (HTTP 429 COST_BLOCKED). */
export class CostBlockedError extends Error {
  constructor(
    readonly reason: string,
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = 'CostBlockedError';
  }
}

/**
 * Raised when DNC, missing consent or quiet hours suppressed the send
 * (HTTP 403 COMPLIANCE_BLOCKED). Never retry this: the contact is still on
 * the DNC list a minute later, and quiet hours need a re-queue, not a retry.
 */
export class ComplianceBlockedError extends Error {
  constructor(
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'ComplianceBlockedError';
  }
}

/**
 * Raised when the api could not call the provider for an operational reason
 * (HTTP 503 INTEGRATION_UNAVAILABLE: not configured, disabled, credentials
 * rejected, upstream down). For an optional enrichment step this means
 * "skip the step", not "fail the job".
 */
export class IntegrationUnavailableError extends Error {
  constructor(
    readonly provider: string,
    readonly reason: string,
    message: string,
  ) {
    super(message);
    this.name = 'IntegrationUnavailableError';
  }
}

export class InternalApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'InternalApiError';
  }
}

async function postInternal<T>(
  path: string,
  accountId: string,
  body: Record<string, unknown>,
): Promise<T> {
  const base = process.env.INTERNAL_API_BASE_URL;
  const token = process.env.INTERNAL_API_TOKEN;
  if (!base || !token) throw new InternalApiNotConfiguredError();

  const res = await fetch(`${base}/internal/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-halo-account-id': accountId,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (payload?.code === 'COST_BLOCKED') {
      throw new CostBlockedError(
        payload.reason ?? 'UNKNOWN',
        payload.provider ?? 'unknown',
        payload.message ?? 'Call blocked by cost control',
      );
    }
    throw new InternalApiError(429, payload?.message ?? 'Rate limited');
  }

  if (res.status === 403) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (payload?.code === 'COMPLIANCE_BLOCKED') {
      throw new ComplianceBlockedError(
        payload.reason ?? 'UNKNOWN',
        payload.message ?? 'Blocked by compliance rules',
      );
    }
    throw new InternalApiError(403, payload?.message ?? 'Forbidden');
  }

  if (res.status === 503) {
    const payload = (await res.json().catch(() => ({}))) as Record<string, any>;
    if (payload?.code === 'INTEGRATION_UNAVAILABLE') {
      throw new IntegrationUnavailableError(
        payload.provider ?? 'unknown',
        payload.reason ?? 'UPSTREAM_ERROR',
        payload.message ?? 'Integration unavailable',
      );
    }
    throw new InternalApiError(503, payload?.message ?? 'Service unavailable');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new InternalApiError(
      res.status,
      `internal/${path} failed: ${res.status} ${text.slice(0, 300)}`,
    );
  }

  return (await res.json()) as T;
}

export interface ChatCompletionResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

export interface CostAttribution {
  /** Workflow-scoped budget bucket, e.g. agent:lead_analyst. */
  workflow?: string;
  leadId?: string;
  propertyId?: string;
  dealId?: string;
  campaignId?: string;
  automationRunId?: string;
}

export function chatCompletion(
  accountId: string,
  input: {
    model: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
  } & CostAttribution,
): Promise<ChatCompletionResponse> {
  return postInternal<ChatCompletionResponse>('ai/chat-completion', accountId, {
    ...input,
  });
}

export interface WebResearchResponse extends ChatCompletionResponse {
  /** Searches the provider ran. */
  searches: number;
  /** The pages those searches returned. */
  sources: { url: string; title: string | null }[];
}

/**
 * A completion that may search the web (the api's ai/web-research): the
 * same cost control as chatCompletion, each search priced on top.
 */
export function webResearch(
  accountId: string,
  input: {
    model: string;
    messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
    temperature?: number;
    maxTokens?: number;
    maxSearches: number;
    allowedDomains?: string[];
  } & CostAttribution,
): Promise<WebResearchResponse> {
  return postInternal<WebResearchResponse>('ai/web-research', accountId, {
    ...input,
  });
}

export type MessageSendReceipt =
  | {
      channel: 'sms';
      sid: string | null;
      numSegments: number | null;
      status: string | null;
    }
  | {
      channel: 'email';
      providerMessageId: string | null;
      provider: string | null;
    };

/**
 * Sends an approved message by id. Nothing else is sent: the api reads the
 * recipient, body and sender from the stored message and its own config,
 * and refuses anything that is not an approved outbound message.
 */
export function sendApprovedMessage(
  accountId: string,
  messageId: string,
): Promise<MessageSendReceipt> {
  return postInternal(
    `messages/${encodeURIComponent(messageId)}/send`,
    accountId,
    {},
  );
}

export interface SkipTraceStepResponse {
  provider: string;
  status: 'matched' | 'no_match' | 'error' | 'skipped';
  reason?: string;
  costUsd: number;
  phonesFound: number;
  emailsFound: number;
  /** Whether a found phone / email was stored on the lead (encrypted, by the api). */
  stored: { phone: boolean; email: boolean };
}

/** Skip-traces a lead; the api stores what it finds and returns counts only. */
export function skipTrace(
  accountId: string,
  leadId: string,
): Promise<SkipTraceStepResponse> {
  return postInternal<SkipTraceStepResponse>(
    'enrichment/skip-trace',
    accountId,
    { leadId },
  );
}

export interface EnrichmentStepResponse {
  sourceRecordId: string | null;
  costUsd: number;
  cached: boolean;
}

export interface EnrichmentAddress {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
}

export function geocode(
  accountId: string,
  input: EnrichmentAddress & CostAttribution,
): Promise<EnrichmentStepResponse> {
  return postInternal<EnrichmentStepResponse>('enrichment/geocode', accountId, {
    ...input,
  });
}

export function propertyLookup(
  accountId: string,
  input: EnrichmentAddress & CostAttribution,
): Promise<EnrichmentStepResponse> {
  return postInternal<EnrichmentStepResponse>(
    'enrichment/property-lookup',
    accountId,
    { ...input },
  );
}

// ----------------------------------------------------------------- agents

export interface AgentRunOpenInput {
  agent: string;
  entityType: AgentEntityType;
  entityId: string;
  trigger: 'lifecycle' | 'inbound' | 'sweep' | 'manual';
  triggerEventId?: string;
  actorId?: string | null;
}

/** Opens the AutomationRun for an agent before any work; returns its id. */
export function openAgentRun(
  accountId: string,
  input: AgentRunOpenInput,
): Promise<{ id: string }> {
  return postInternal<{ id: string }>('agent/runs', accountId, { ...input });
}

/**
 * A market agent's context, built by the api: the research, the draft and
 * the ranking live there (docs/agent-design.md s3.6, s3.7).
 */
export function marketAgentContext<T>(
  accountId: string,
  agent: 'market_intelligence' | 'market_expansion',
  entityId: string,
): Promise<T> {
  return postInternal<T>('agent/market-context', accountId, {
    agent,
    entityId,
  });
}

/** What the agent saw and what the model answered, kept with the run (docs/agent-eval.md). */
export interface AgentReplay {
  context: Record<string, unknown>;
  /** The model's raw reply; null when a rule decided. */
  reply: string | null;
}

export interface AgentDecisionReport {
  status: 'COMPLETED' | 'AWAITING_APPROVAL' | 'FAILED' | 'CANCELLED';
  decision?: AgentDecision;
  costUsd?: number;
  error?: string;
  replay?: AgentReplay;
}

/** Reports the decision; the api applies it within the tenant's autonomy tier. */
export function recordAgentDecision(
  accountId: string,
  runId: string,
  report: AgentDecisionReport,
): Promise<unknown> {
  return postInternal(
    `agent/runs/${encodeURIComponent(runId)}/decision`,
    accountId,
    { ...report },
  );
}
