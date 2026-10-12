import {
  AGENT_TIER,
  LEAD_ANALYST_PROMPT_VERSION,
  agentWorkflow,
  parseLeadAnalystOutput,
  prompts,
  resolveAgentModel,
  type AgentAction,
  type AgentDecision,
  type AgentModels,
  type LeadAnalystOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import type { LeadAnalystContext } from './agent-context';

export interface HardRuleResult {
  recommendation: 'disqualified' | 'hold';
  rule: string;
  reason: string;
}

const OUT_OF_SCOPE_TYPES =
  /\b(land|lot|vacant land|commercial|industrial|office|retail|warehouse|agricultural)\b/i;
const DISTRESS_TAGS = [
  'tax:delinquent',
  'foreclosure',
  'lien',
  'distressed_sale',
  'stale_listing',
  'listing:expired',
  'listing:withdrawn',
  'listing:canceled',
];
const MAX_CONTEXT_CHARS = 8000;

/** Thrown when the model's reply is not the JSON the prompt asked for. */
export class AgentOutputError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'AgentOutputError';
  }
}

/**
 * Deterministic first (design doc s2.5): when a rule answers, the model is
 * not asked and the run costs nothing. Disqualifies are the autonomous tier
 * (applied at once only under `standard` autonomy); a hold just records.
 */
export function hardRule(ctx: LeadAnalystContext): HardRuleResult | null {
  if (ctx.dnc) {
    return {
      recommendation: 'disqualified',
      rule: 'dnc',
      reason: 'Contact is on the do-not-call list',
    };
  }
  if (!ctx.lead.address.street || !ctx.lead.address.zip) {
    return {
      recommendation: 'disqualified',
      rule: 'no_address',
      reason: 'No usable street address or ZIP on the lead',
    };
  }
  const typeText = [
    ...ctx.sources.map((s) =>
      String(s.summary.propertyType ?? s.summary.useCode ?? ''),
    ),
    ...ctx.lead.tags,
  ].join(' ');
  if (OUT_OF_SCOPE_TYPES.test(typeText)) {
    return {
      recommendation: 'disqualified',
      rule: 'property_type',
      reason: 'Property type is outside single-family and small multifamily',
    };
  }
  const tags = new Set(ctx.lead.tags);
  if (tags.has('owner:occupied') && !DISTRESS_TAGS.some((t) => tags.has(t))) {
    return {
      recommendation: 'hold',
      rule: 'owner_occupied_no_distress',
      reason: 'Owner-occupied with no distress or equity signal on file',
    };
  }
  return null;
}

export function decisionFromHardRule(rule: HardRuleResult): AgentDecision {
  const score = rule.recommendation === 'disqualified' ? 5 : 40;
  const actions: AgentAction[] = [
    { type: 'set_lead_score', score },
    { type: 'append_note', note: `${rule.reason} (rule: ${rule.rule})` },
  ];
  if (rule.recommendation === 'disqualified') {
    actions.push({
      type: 'transition_lead',
      to: 'disqualified',
      reason: rule.reason,
      gated: false,
    });
  }
  return {
    agent: 'lead_analyst',
    promptVersion: LEAD_ANALYST_PROMPT_VERSION,
    model: null,
    recommendation: rule.recommendation,
    summary: `${rule.recommendation} by rule ${rule.rule}: ${rule.reason}`,
    rationale: rule.reason,
    confidence: 1,
    hardRule: rule.rule,
    actions,
  };
}

export function decisionFromOutput(
  out: LeadAnalystOutput,
  model: string,
): AgentDecision {
  const score = Math.round(Math.min(100, Math.max(0, out.score)));
  const actions: AgentAction[] = [
    { type: 'set_lead_score', score },
    { type: 'append_note', note: out.rationale },
  ];
  if (out.recommendation === 'qualified') {
    actions.push({
      type: 'transition_lead',
      to: 'qualified',
      reason: 'Lead Analyst recommendation',
      gated: true,
    });
    if (out.first_touch_sms) {
      actions.push({
        type: 'draft_message',
        channel: 'sms',
        recipientType: 'seller',
        content: out.first_touch_sms,
        gated: true,
      });
    }
    if (out.first_touch_email) {
      actions.push({
        type: 'draft_message',
        channel: 'email',
        recipientType: 'seller',
        content: out.first_touch_email.body,
        subject: out.first_touch_email.subject,
        gated: true,
      });
    }
  } else if (out.recommendation === 'disqualified') {
    actions.push({
      type: 'transition_lead',
      to: 'disqualified',
      reason: out.rationale.slice(0, 200),
      gated: true,
    });
  }
  const signals = out.signals.length ? out.signals.join(', ') : 'no named signals';
  return {
    agent: 'lead_analyst',
    promptVersion: LEAD_ANALYST_PROMPT_VERSION,
    model,
    recommendation: out.recommendation,
    summary: `${out.recommendation} (${score}/100): ${signals}`,
    rationale: out.rationale,
    hardRule: null,
    actions,
  };
}

export interface LeadAnalystResult {
  decision: AgentDecision;
  costUsd: number;
  raw?: string;
}

/**
 * Scores an enriched lead and recommends qualified / disqualified / hold,
 * with first-touch drafts for a qualified lead. Rules first, then one
 * mid-tier model call through the api's cost-governed route.
 */
export class LeadAnalystAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: LeadAnalystContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = hardRule(ctx);
    if (rule) return { decision: decisionFromHardRule(rule), costUsd: 0 };

    const model = resolveAgentModel(AGENT_TIER.lead_analyst, this.opts.models);
    // Plain split/join: the context carries "$" amounts that String.replace
    // would read as replacement patterns.
    const user = prompts.lead_analyst.user
      .split('{{leadContext}}')
      .join(JSON.stringify(ctx, null, 1).slice(0, MAX_CONTEXT_CHARS));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.lead_analyst.system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      maxTokens: 900,
      leadId: ctx.lead.id,
      automationRunId: runId,
      workflow: agentWorkflow('lead_analyst'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseLeadAnalystOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    return {
      decision: decisionFromOutput(out, completion.model),
      costUsd,
      raw: completion.content,
    };
  }
}
