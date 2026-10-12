import { z } from 'zod';

/**
 * The agent frame shared by the api (triggers, run ledger, approval) and the
 * worker (the agents themselves). See docs/agent-design.md.
 */

export const AGENT_NAMES = [
  'lead_analyst',
  'deal_underwriter',
  'outreach_drafter',
  'disposition_matcher',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_LABEL: Record<AgentName, string> = {
  lead_analyst: 'Lead Analyst',
  deal_underwriter: 'Deal Underwriter',
  outreach_drafter: 'Outreach Drafter',
  disposition_matcher: 'Disposition Matcher',
};

/** How a run started (design doc s4). */
export type AgentTrigger = 'lifecycle' | 'inbound' | 'sweep' | 'manual';
export type AgentEntityType = 'lead' | 'deal' | 'message';

/** One job on the `agents` queue. */
export interface AgentJobPayload {
  agent: AgentName;
  accountId: string;
  entityType: AgentEntityType;
  entityId: string;
  trigger: AgentTrigger;
  /** What fired the trigger (timeline event id, message id, sweep date), for idempotency. */
  triggerEventId?: string;
  actorId?: string | null;
}

/** BullMQ job id: the same (agent, entity, trigger event) is never queued twice. */
export function agentJobId(p: AgentJobPayload): string {
  // BullMQ rejects custom ids containing ":", so parts are joined with "__"
  // and any ":" inside a part (enriched:job-1, sweep:2026-10-12) becomes "-".
  return [p.agent, p.entityType, p.entityId, p.triggerEventId ?? p.trigger]
    .map((part) => String(part).replace(/:/g, '-'))
    .join('__');
}

/** Tenant setting (design doc s5). */
export type AgentAutonomy = 'draft_only' | 'standard';
export const AGENT_AUTONOMY_LEVELS = ['draft_only', 'standard'] as const;

export type AgentModelTier = 'cheap' | 'mid' | 'strong';
export type AgentModels = Partial<Record<AgentModelTier, string>>;

/**
 * Platform defaults (design doc s7). OpenAI models until an Anthropic
 * workspace is configured; a tenant overrides any tier in its control plane.
 * Claude equivalents: cheap claude-haiku-4-5, mid claude-sonnet-5-5,
 * strong claude-opus-5-5.
 */
export const DEFAULT_AGENT_MODELS: Record<AgentModelTier, string> = {
  cheap: 'gpt-4o-mini',
  mid: 'gpt-4o',
  strong: 'gpt-4o',
};

export function resolveAgentModel(
  tier: AgentModelTier,
  overrides?: AgentModels | null,
): string {
  const override = overrides?.[tier];
  return typeof override === 'string' && override.trim()
    ? override.trim()
    : DEFAULT_AGENT_MODELS[tier];
}

export const AGENT_TIER: Record<AgentName, AgentModelTier> = {
  lead_analyst: 'mid',
  deal_underwriter: 'strong',
  outreach_drafter: 'mid',
  disposition_matcher: 'mid',
};

/** Workflow name on the run and scopeRef of the agent's budget bucket. */
export function agentWorkflow(agent: AgentName): string {
  return `agent:${agent}`;
}

/**
 * What an agent wants to happen. Actions with `gated: true` only take effect
 * when a person approves the run; the rest belong to the autonomous tier and
 * apply at once only when the tenant's autonomy is `standard`.
 */
export type AgentAction =
  | { type: 'set_lead_score'; score: number }
  | { type: 'append_note'; note: string }
  | {
      type: 'transition_lead';
      to: 'qualified' | 'disqualified';
      reason: string;
      gated: boolean;
    }
  | {
      type: 'draft_message';
      channel: 'sms' | 'email';
      recipientType: 'seller' | 'buyer';
      content: string;
      subject?: string;
      gated: true;
    }
  | {
      /**
       * Deal Underwriter numbers (design doc s3.2). Autonomous in every tier:
       * numbers never reach a seller. The api applies them only when the deal
       * has not been edited since `dealUpdatedAt`, and records the result
       * either way.
       */
      type: 'set_deal_economics';
      arv: number | null;
      repairEstimate: number | null;
      mao: number | null;
      confidence: number | null;
      offerLow: number | null;
      offerHigh: number | null;
      rationale: string;
      compsSummary: string | null;
      /** deal.updatedAt (ISO) when the context was loaded. */
      dealUpdatedAt: string;
    };

export interface AgentDecision {
  agent: AgentName;
  promptVersion: string;
  /** null when a hard rule decided and no model was asked. */
  model: string | null;
  recommendation: string;
  summary: string;
  rationale: string;
  confidence?: number;
  /** The deterministic rule that decided, when one did. */
  hardRule?: string | null;
  actions: AgentAction[];
}

export type AgentRunOutcome =
  | 'COMPLETED'
  | 'AWAITING_APPROVAL'
  | 'FAILED'
  | 'CANCELLED';

export function decisionNeedsApproval(decision: AgentDecision): boolean {
  return decision.actions.some((a) => 'gated' in a && a.gated);
}

// ----------------------------------------------------------------- Lead Analyst

export const LEAD_ANALYST_PROMPT_VERSION = 'lead_analyst.v1';

export const LeadAnalystOutputSchema = z.object({
  score: z.number().min(0).max(100),
  recommendation: z.enum(['qualified', 'disqualified', 'hold']),
  rationale: z.string().min(1).max(2000),
  signals: z.array(z.string().max(120)).max(20).default([]),
  first_touch_sms: z.string().max(320).nullable().optional(),
  first_touch_email: z
    .object({ subject: z.string().max(150), body: z.string().max(3000) })
    .nullable()
    .optional(),
});
export type LeadAnalystOutput = z.infer<typeof LeadAnalystOutputSchema>;

/** The first JSON object in a model reply, or undefined when there is none. */
function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/**
 * Parses the model's reply: the first JSON object in the text, validated.
 * Returns null when there is none or it does not fit, so the caller can
 * record a failed run instead of acting on garbage.
 */
export function parseLeadAnalystOutput(text: string): LeadAnalystOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = LeadAnalystOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// -------------------------------------------------------------- Deal Underwriter

export const DEAL_UNDERWRITER_PROMPT_VERSION = 'deal_underwriter.v1';

const money = z.number().min(0).max(100_000_000).nullable().default(null);

export const DealUnderwriterOutputSchema = z.object({
  arv: money,
  repair_estimate: money,
  mao: z.number().min(-100_000_000).max(100_000_000).nullable().default(null),
  offer_low: money,
  offer_high: money,
  confidence: z.number().min(0).max(1),
  recommendation: z.enum(['offer', 'pass', 'hold']),
  rationale: z.string().min(1).max(3000),
  comps_summary: z.string().max(2000).nullable().default(null),
});
export type DealUnderwriterOutput = z.infer<typeof DealUnderwriterOutputSchema>;

export function parseDealUnderwriterOutput(
  text: string,
): DealUnderwriterOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = DealUnderwriterOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
