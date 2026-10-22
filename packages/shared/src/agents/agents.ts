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
  'buyer_responder',
] as const;
export type AgentName = (typeof AGENT_NAMES)[number];

export const AGENT_LABEL: Record<AgentName, string> = {
  lead_analyst: 'Lead Analyst',
  deal_underwriter: 'Deal Underwriter',
  outreach_drafter: 'Outreach Drafter',
  disposition_matcher: 'Disposition Matcher',
  buyer_responder: 'Buyer Responder',
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
  /** The inbound message that fired an `inbound` trigger. */
  messageId?: string;
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
  buyer_responder: 'mid',
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
      /** The inbound message this draft answers, when it answers one. */
      inReplyToMessageId?: string;
      /** The buyer a buyer draft goes to (recipientType buyer). */
      buyerId?: string;
      gated: true;
    }
  | {
      /** The inbound message's intent, recorded on the message and the timeline. */
      type: 'classify_inbound';
      messageId: string;
      intent: InboundIntent | BuyerReplyIntent;
      confidence: number;
      method: 'rule' | 'model';
    }
  | {
      /**
       * The contact asked not to be contacted: DNC entry plus revoked
       * consents through the compliance service. Autonomous when a rule or a
       * confident model classification found it; gated when the model was
       * unsure.
       */
      type: 'record_opt_out';
      messageId: string;
      reason: string;
      gated: boolean;
    }
  | {
      /** The number does not reach the owner: tags the lead for a new skip trace. */
      type: 'flag_contact';
      reason: 'wrong_number';
      note: string;
    }
  | {
      type: 'transition_deal';
      to: 'negotiating' | 'lost';
      reason: string;
      gated: true;
    }
  | {
      /** Disposition Matcher ranking (design doc s3.4): recorded for the deal, never sent. */
      type: 'rank_buyers';
      shortlist: BuyerShortlistEntry[];
      consideredCount: number;
    }
  | {
      /**
       * One email draft per shortlisted buyer, created in the communications
       * approval queue once a person approves the run. Sends still go
       * through the same boundary as every other message.
       */
      type: 'queue_buyer_blast';
      buyerIds: string[];
      subject: string;
      body: string;
      gated: true;
    }
  | {
      /**
       * A price a buyer named in a reply (Buyer Responder), captured as an
       * offer for a person to confirm (docs/contract-flipping.md s5). It
       * records what the buyer said; it accepts, counters and promises
       * nothing, and an agent-captured offer cannot be accepted until a
       * person checks the amount against the message.
       */
      type: 'record_buyer_offer';
      buyerId: string;
      messageId: string;
      amount: number;
      terms: string | null;
      kind: 'indication' | 'written_offer';
      confidence: number;
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

export const LEAD_ANALYST_PROMPT_VERSION = 'lead_analyst.v2';

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

export const DEAL_UNDERWRITER_PROMPT_VERSION = 'deal_underwriter.v2';

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

// ------------------------------------------------------------- Outreach Drafter

export const INBOUND_INTENTS = [
  'interested',
  'not_interested',
  'callback',
  'wrong_number',
  'opt_out',
  'unclear',
] as const;
export type InboundIntent = (typeof INBOUND_INTENTS)[number];

export const OUTREACH_DRAFTER_PROMPT_VERSION = 'outreach_drafter.v1';

const OPT_OUT_PHRASES: RegExp[] = [
  /\b(stop|quit|cease|never|do not|don'?t|dont)\b[^.!?]{0,40}\b(text|texting|texts|message|messaging|messages|contact|contacting|call|calling|calls|email|emailing|reach(ing)? out)\b/i,
  /\b(remove|take) me (off|from)\b/i,
  /\bunsubscribe\b/i,
  /\bleave me alone\b/i,
  /\bno more (texts|messages|calls|emails|deals|offers)\b/i,
  /\bstop sending (me )?(any )?(more )?(deals|offers|emails|texts|messages|these|them)\b/i,
  /\bopt ?out\b/i,
  /\blose (my|this) number\b/i,
];
const WRONG_NUMBER_PHRASES: RegExp[] = [
  /\bwrong (number|person)\b/i,
  /\b(don'?t|do not) know (who this is|what (you'?re|you are) talking about)\b/i,
  /\bnot the owner\b/i,
  /\bno one (by that name|named)\b/i,
  /\bnever owned\b/i,
  /\byou have the wrong\b/i,
  /\bnot (my|mine|our) (house|property|home|address)\b/i,
];

/**
 * Rule-first classification of an inbound reply (design doc s3.3): an
 * opt-out or a wrong number is decided here, at no cost and with no model
 * in the loop. Whole-message keywords (STOP, HELP) never reach the agent;
 * the webhook handles them first. Null means "ask the model".
 */
export function classifyInboundByRule(
  text: string,
): { intent: 'opt_out' | 'wrong_number'; rule: string } | null {
  const t = text.trim();
  if (!t) return null;
  const optOut = OPT_OUT_PHRASES.find((re) => re.test(t));
  if (optOut) return { intent: 'opt_out', rule: `phrase:${optOut.source}` };
  const wrong = WRONG_NUMBER_PHRASES.find((re) => re.test(t));
  if (wrong) return { intent: 'wrong_number', rule: `phrase:${wrong.source}` };
  return null;
}

export const OutreachDrafterOutputSchema = z.object({
  intent: z.enum([...INBOUND_INTENTS, 'follow_up']),
  confidence: z.number().min(0).max(1),
  reply: z
    .object({
      body: z.string().min(1).max(3000),
      subject: z.string().max(150).nullable().default(null),
    })
    .nullable()
    .default(null),
  rationale: z.string().min(1).max(2000),
  next_step: z.string().max(300).nullable().default(null),
});
export type OutreachDrafterOutput = z.infer<typeof OutreachDrafterOutputSchema>;

export function parseOutreachDrafterOutput(
  text: string,
): OutreachDrafterOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = OutreachDrafterOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ----------------------------------------------------------- Disposition Matcher

export interface BuyerShortlistEntry {
  buyerId: string;
  name: string;
  rank: number;
  fit: 'strong' | 'possible';
  reason: string;
  /** The deterministic buy-box score the model started from (0-100). */
  ruleScore: number;
}

export const DISPOSITION_MATCHER_PROMPT_VERSION = 'disposition_matcher.v2';

export const DispositionMatcherOutputSchema = z.object({
  shortlist: z
    .array(
      z.object({
        buyer_id: z.string().min(1).max(64),
        fit: z.enum(['strong', 'possible']),
        reason: z.string().min(1).max(300),
      }),
    )
    .max(25)
    .default([]),
  blast: z
    .object({
      subject: z.string().min(1).max(150),
      body: z.string().min(1).max(4000),
    })
    .nullable()
    .default(null),
  rationale: z.string().min(1).max(2000),
});
export type DispositionMatcherOutput = z.infer<
  typeof DispositionMatcherOutputSchema
>;

export function parseDispositionMatcherOutput(
  text: string,
): DispositionMatcherOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = DispositionMatcherOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ------------------------------------------------------------ Buyer Responder

/** How a cash buyer answered a deal we marketed to them. */
export const BUYER_REPLY_INTENTS = [
  'interested',
  'question',
  'offer',
  'not_interested',
  'opt_out',
  'unclear',
] as const;
export type BuyerReplyIntent = (typeof BUYER_REPLY_INTENTS)[number];

export const BUYER_RESPONDER_PROMPT_VERSION = 'buyer_responder.v1';

export const BuyerResponderOutputSchema = z.object({
  intent: z.enum(BUYER_REPLY_INTENTS),
  confidence: z.number().min(0).max(1),
  reply: z
    .object({
      body: z.string().min(1).max(3000),
      subject: z.string().max(150).nullable().default(null),
    })
    .nullable()
    .default(null),
  /** What the buyer offered, when they named a price or terms. */
  offer: z
    .object({
      amount: z.number().min(0).max(100_000_000).nullable().default(null),
      terms: z.string().max(500).nullable().default(null),
    })
    .nullable()
    .default(null),
  rationale: z.string().min(1).max(2000),
});
export type BuyerResponderOutput = z.infer<typeof BuyerResponderOutputSchema>;

export function parseBuyerResponderOutput(
  text: string,
): BuyerResponderOutput | null {
  const raw = firstJsonObject(text);
  if (raw === undefined) return null;
  const parsed = BuyerResponderOutputSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}
