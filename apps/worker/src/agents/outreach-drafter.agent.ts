import {
  AGENT_TIER,
  OUTREACH_DRAFTER_PROMPT_VERSION,
  agentWorkflow,
  classifyInboundByRule,
  parseOutreachDrafterOutput,
  prompts,
  resolveAgentModel,
  type AgentAction,
  type AgentDecision,
  type AgentModels,
  type OutreachDrafterOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';
import type { OutreachContext } from './outreach-context';

const MAX_CONTEXT_CHARS = 12000;
const DEFAULT_MAX_FOLLOW_UPS = 3;
const DEFAULT_STRONG_TIER_MIN_ARV = 400000;
/** Below this the model's own opt-out call waits for a person. */
const OPT_OUT_AUTONOMY_MIN_CONFIDENCE = 0.7;

export function maxFollowUps(): number {
  const n = Number(process.env.AGENT_FOLLOWUP_MAX);
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_MAX_FOLLOW_UPS;
}

export function strongTierMinArv(): number {
  const n = Number(process.env.OUTREACH_STRONG_TIER_MIN_ARV);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STRONG_TIER_MIN_ARV;
}

const snippet = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);

function ruleDecision(
  rule: string,
  recommendation: string,
  text: string,
  actions: AgentAction[] = [],
): AgentDecision {
  return {
    agent: 'outreach_drafter',
    promptVersion: OUTREACH_DRAFTER_PROMPT_VERSION,
    model: null,
    recommendation,
    summary: `${recommendation} by rule ${rule}: ${text}`,
    rationale: text,
    confidence: 1,
    hardRule: rule,
    actions: [...actions, { type: 'append_note', note: `${text} (rule: ${rule})` }],
  };
}

/**
 * Rules first (design doc s2.5, s3.3): no seller, an opt-out or wrong-number
 * phrase, a DNC hit and the follow-up cap are all decided here, at no cost
 * and with no model in the loop. Null means "ask the model".
 */
export function decideByRule(ctx: OutreachContext): AgentDecision | null {
  if (!ctx.lead) {
    return ruleDecision(
      'no_lead',
      'hold',
      'No seller lead on this deal; nothing to contact',
    );
  }
  if (ctx.inbound) {
    const rule = classifyInboundByRule(ctx.inbound.content);
    const quoted = `"${snippet(ctx.inbound.content)}"`;
    if (rule?.intent === 'opt_out') {
      return ruleDecision(
        'opt_out_phrase',
        'opt_out',
        `Seller asked not to be contacted: ${quoted}`,
        [
          {
            type: 'classify_inbound',
            messageId: ctx.inbound.id,
            intent: 'opt_out',
            confidence: 1,
            method: 'rule',
          },
          {
            type: 'record_opt_out',
            messageId: ctx.inbound.id,
            reason: `Seller wrote: ${quoted}`,
            gated: false,
          },
        ],
      );
    }
    if (rule?.intent === 'wrong_number') {
      return ruleDecision(
        'wrong_number_phrase',
        'wrong_number',
        `Reply says this contact is not the owner: ${quoted}`,
        [
          {
            type: 'classify_inbound',
            messageId: ctx.inbound.id,
            intent: 'wrong_number',
            confidence: 1,
            method: 'rule',
          },
          {
            type: 'flag_contact',
            reason: 'wrong_number',
            note: `Seller wrote: ${quoted}`,
          },
        ],
      );
    }
  }
  if (ctx.compliance.dnc) {
    return ruleDecision(
      'dnc',
      'hold',
      'Contact is on the do-not-call list; no outreach',
    );
  }
  if (!ctx.inbound) {
    const sent = ctx.followUps.outboundSinceLastInbound;
    if (sent >= maxFollowUps()) {
      return ruleDecision(
        'follow_up_cap',
        'hold',
        `No reply after ${sent} follow-up(s); parking this deal`,
      );
    }
    if (!ctx.lead.hasPhone && !ctx.lead.hasEmail) {
      return ruleDecision(
        'no_contact',
        'hold',
        'No phone or email on file for the seller',
      );
    }
  }
  return null;
}

/** Replies go back on the channel they came in on; follow-ups prefer text. */
export function draftChannel(ctx: OutreachContext): 'sms' | 'email' | null {
  if (ctx.inbound) return ctx.inbound.channel;
  if (ctx.lead?.hasPhone) return 'sms';
  if (ctx.lead?.hasEmail) return 'email';
  return null;
}

export function decisionFromOutput(
  out: OutreachDrafterOutput,
  model: string,
  ctx: OutreachContext,
): AgentDecision {
  const inbound = ctx.inbound;
  const actions: AgentAction[] = [];
  if (inbound && out.intent !== 'follow_up') {
    actions.push({
      type: 'classify_inbound',
      messageId: inbound.id,
      intent: out.intent,
      confidence: out.confidence,
      method: 'model',
    });
  }
  actions.push({ type: 'append_note', note: out.rationale });

  const channel = draftChannel(ctx);
  const draft: AgentAction | null =
    out.reply && channel
      ? {
          type: 'draft_message',
          channel,
          recipientType: 'seller',
          content: out.reply.body,
          subject:
            channel === 'email' ? (out.reply.subject ?? undefined) : undefined,
          inReplyToMessageId: inbound?.id,
          gated: true,
        }
      : null;
  const quoted = inbound ? `"${snippet(inbound.content)}"` : '';
  const conf = out.confidence.toFixed(2);

  switch (out.intent) {
    case 'opt_out':
      if (inbound) {
        actions.push({
          type: 'record_opt_out',
          messageId: inbound.id,
          reason: `Model read ${quoted} as an opt-out (confidence ${conf})`,
          gated: out.confidence < OPT_OUT_AUTONOMY_MIN_CONFIDENCE,
        });
      }
      break;
    case 'wrong_number':
      actions.push({
        type: 'flag_contact',
        reason: 'wrong_number',
        note: `Model read ${quoted} as a wrong number (confidence ${conf})`,
      });
      break;
    case 'not_interested':
      if (draft) actions.push(draft);
      if (ctx.deal && ctx.deal.stage !== 'lost') {
        actions.push({
          type: 'transition_deal',
          to: 'lost',
          reason: `Seller declined: ${quoted}`,
          gated: true,
        });
      }
      break;
    case 'interested':
      if (draft) actions.push(draft);
      if (ctx.deal?.stage === 'contacted') {
        actions.push({
          type: 'transition_deal',
          to: 'negotiating',
          reason: 'Seller replied with interest',
          gated: true,
        });
      }
      break;
    default:
      // callback, unclear, follow_up: the draft is the whole point.
      if (draft) actions.push(draft);
  }

  const summary = inbound
    ? `${out.intent} (${conf}) re ${quoted}${draft ? '; reply drafted' : ''}`
    : `${out.intent}: ${draft ? `${channel} follow-up drafted` : 'no draft'}`;
  return {
    agent: 'outreach_drafter',
    promptVersion: OUTREACH_DRAFTER_PROMPT_VERSION,
    model,
    recommendation: out.intent,
    summary,
    rationale: out.rationale,
    confidence: out.confidence,
    hardRule: null,
    actions,
  };
}

function taskFor(ctx: OutreachContext, channel: string | null): string {
  if (ctx.inbound) {
    return `Classify the seller's latest inbound message (field "inbound") and, unless intent is opt_out, wrong_number or not_interested, write the reply on the ${ctx.inbound.channel} channel.`;
  }
  const since = ctx.followUps.lastOutboundAt
    ? ` since our message on ${ctx.followUps.lastOutboundAt.slice(0, 10)}`
    : '';
  return `No reply has arrived${since}. Write one short follow-up on the ${channel ?? 'sms'} channel that adds a reason to respond (a new question, flexibility on timing) without repeating the last message; intent is follow_up.`;
}

/**
 * Drafts the next message in a seller conversation (design doc s3.3). Rules
 * first; then one model call that classifies the reply and writes the
 * response. Every draft is gated; the agent never sends.
 */
export class OutreachDrafterAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: OutreachContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = decideByRule(ctx);
    if (rule) return { decision: rule, costUsd: 0 };

    // Negotiation replies on a valuable deal get the strong tier (s3.3).
    const tier =
      ctx.deal?.stage === 'negotiating' &&
      (ctx.deal.arv ?? 0) >= strongTierMinArv()
        ? 'strong'
        : AGENT_TIER.outreach_drafter;
    const model = resolveAgentModel(tier, this.opts.models);
    const channel = draftChannel(ctx);
    const user = prompts.outreach_drafter.user
      .split('{{context}}')
      .join(JSON.stringify(ctx, null, 1).slice(0, MAX_CONTEXT_CHARS))
      .split('{{task}}')
      .join(taskFor(ctx, channel));
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.outreach_drafter.system },
        { role: 'user', content: user },
      ],
      temperature: 0.4,
      maxTokens: 700,
      leadId: ctx.lead?.id,
      dealId: ctx.deal?.id,
      automationRunId: runId,
      workflow: agentWorkflow('outreach_drafter'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseOutreachDrafterOutput(completion.content);
    if (!out) {
      throw new AgentOutputError(
        'The model reply was not the JSON the prompt asked for',
        completion.content,
      );
    }
    return {
      decision: decisionFromOutput(out, completion.model, ctx),
      costUsd,
      raw: completion.content,
    };
  }
}
