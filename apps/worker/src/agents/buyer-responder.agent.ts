import {
  AGENT_TIER,
  BUYER_RESPONDER_PROMPT_VERSION,
  agentWorkflow,
  buyerAskingPrice,
  classifyInboundByRule,
  parseBuyerResponderOutput,
  prompts,
  resolveAgentModel,
  type AgentAction,
  type AgentDecision,
  type AgentModels,
  type BuyerPrice,
  type BuyerResponderOutput,
} from '@halo/shared';
import { estimateAiCostUsd } from '../ai-model';
import { chatCompletion } from '../internal-api.client';
import type { BuyerReplyContext } from './buyer-context';
import { AgentOutputError, type LeadAnalystResult } from './lead-analyst.agent';

const MAX_CONTEXT_CHARS = 10000;
/** Below this the model's own opt-out call waits for a person. */
const OPT_OUT_AUTONOMY_MIN_CONFIDENCE = 0.7;
/** Stages in which the deal can no longer be offered to a buyer. */
const UNAVAILABLE_STAGES = new Set(['assigned', 'closed', 'lost']);

const snippet = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);
const money = (n: number | null | undefined) =>
  n == null ? 'n/a' : `$${Math.round(n).toLocaleString('en-US')}`;

/** What buyers are asked to pay for the deal; never the seller-side price. */
export function buyerPriceFor(ctx: BuyerReplyContext): BuyerPrice | null {
  return buyerAskingPrice(ctx.deal, ctx.defaultAssignmentFee);
}

/** "Re: <their subject>" for an email reply, unless it already is one. */
export function replySubject(subject: string | null): string | undefined {
  const s = subject?.trim();
  if (!s) return undefined;
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function ruleDecision(
  rule: string,
  recommendation: string,
  text: string,
  actions: AgentAction[] = [],
): AgentDecision {
  return {
    agent: 'buyer_responder',
    promptVersion: BUYER_RESPONDER_PROMPT_VERSION,
    model: null,
    recommendation,
    summary: `${recommendation} by rule ${rule}: ${text}`,
    rationale: text,
    confidence: 1,
    hardRule: rule,
    actions: [
      ...actions,
      { type: 'append_note', note: `${text} (rule: ${rule})` },
    ],
  };
}

/**
 * Rules first (design doc s2.5): no buyer or message to answer, an opt-out
 * or wrong-person phrase, a buyer on the do-not-contact list, and a deal
 * that is no longer available are all decided here, at no cost. A deal
 * that is gone still gets a courtesy reply, written from a template. Null
 * means "ask the model".
 */
export function decideByRule(ctx: BuyerReplyContext): AgentDecision | null {
  const inbound = ctx.inbound;
  if (!inbound) {
    return ruleDecision('no_inbound', 'hold', 'No buyer message to answer');
  }
  const buyer = ctx.buyer;
  if (!buyer) {
    return ruleDecision(
      'no_buyer',
      'hold',
      'The reply could not be tied to a buyer on file; a person should answer it',
    );
  }
  const quoted = `"${snippet(inbound.content)}"`;
  const rule = classifyInboundByRule(inbound.content);
  if (rule?.intent === 'opt_out') {
    return ruleDecision(
      'opt_out_phrase',
      'opt_out',
      `${buyer.name} asked not to receive deals: ${quoted}`,
      [
        {
          type: 'classify_inbound',
          messageId: inbound.id,
          intent: 'opt_out',
          confidence: 1,
          method: 'rule',
        },
        {
          type: 'record_opt_out',
          messageId: inbound.id,
          reason: `Buyer wrote: ${quoted}`,
          gated: false,
        },
      ],
    );
  }
  if (rule?.intent === 'wrong_number') {
    return ruleDecision(
      'wrong_person_phrase',
      'wrong_number',
      `Reply says this is not the buyer: ${quoted}`,
      [
        {
          type: 'classify_inbound',
          messageId: inbound.id,
          intent: 'wrong_number',
          confidence: 1,
          method: 'rule',
        },
      ],
    );
  }
  if (ctx.compliance.optedOut) {
    return ruleDecision(
      'opted_out',
      'hold',
      `${buyer.name} asked not to be contacted; no reply`,
    );
  }
  if (UNAVAILABLE_STAGES.has(ctx.deal.stage)) {
    const where = ctx.property?.address ?? 'this property';
    return ruleDecision(
      'deal_unavailable',
      'unavailable',
      `The deal is ${ctx.deal.stage}; a courtesy reply is drafted`,
      [
        {
          type: 'draft_message',
          channel: inbound.channel,
          recipientType: 'buyer',
          buyerId: buyer.id,
          content: `Thanks for getting back to us about ${where}. That one is no longer available. We will send you the next deal that fits what you are buying.`,
          subject:
            inbound.channel === 'email'
              ? replySubject(inbound.subject)
              : undefined,
          inReplyToMessageId: inbound.id,
          gated: true,
        },
      ],
    );
  }
  return null;
}

export function decisionFromOutput(
  out: BuyerResponderOutput,
  model: string,
  ctx: BuyerReplyContext,
): AgentDecision {
  const inbound = ctx.inbound as NonNullable<BuyerReplyContext['inbound']>;
  const buyer = ctx.buyer as NonNullable<BuyerReplyContext['buyer']>;
  const quoted = `"${snippet(inbound.content)}"`;
  const conf = out.confidence.toFixed(2);
  const offer =
    out.offer && (out.offer.amount != null || out.offer.terms)
      ? out.offer
      : null;
  const offerText = offer
    ? ` Offer: ${offer.amount != null ? money(offer.amount) : 'no amount'}${offer.terms ? `, ${offer.terms}` : ''}.`
    : '';

  const actions: AgentAction[] = [
    {
      type: 'classify_inbound',
      messageId: inbound.id,
      intent: out.intent,
      confidence: out.confidence,
      method: 'model',
    },
    { type: 'append_note', note: `${out.rationale}${offerText}` },
  ];
  if (offer?.amount != null && offer.amount > 0 && out.intent !== 'opt_out') {
    actions.push({
      type: 'record_buyer_offer',
      buyerId: buyer.id,
      messageId: inbound.id,
      amount: offer.amount,
      terms: offer.terms ?? null,
      kind: out.intent === 'offer' ? 'written_offer' : 'indication',
      confidence: out.confidence,
    });
  }
  let drafted = false;
  if (out.intent === 'opt_out') {
    actions.push({
      type: 'record_opt_out',
      messageId: inbound.id,
      reason: `Model read ${quoted} as an opt-out (confidence ${conf})`,
      gated: out.confidence < OPT_OUT_AUTONOMY_MIN_CONFIDENCE,
    });
  } else if (out.reply) {
    actions.push({
      type: 'draft_message',
      channel: inbound.channel,
      recipientType: 'buyer',
      buyerId: buyer.id,
      content: out.reply.body,
      subject:
        inbound.channel === 'email'
          ? (out.reply.subject ?? replySubject(inbound.subject))
          : undefined,
      inReplyToMessageId: inbound.id,
      gated: true,
    });
    drafted = true;
  }

  const offerSummary =
    offer?.amount != null ? `; offer ${money(offer.amount)}` : '';
  return {
    agent: 'buyer_responder',
    promptVersion: BUYER_RESPONDER_PROMPT_VERSION,
    model,
    recommendation: out.intent,
    summary: `${out.intent} (${conf}) from ${buyer.name} re ${quoted}${offerSummary}${drafted ? '; reply drafted' : ''}`,
    rationale: out.rationale,
    confidence: out.confidence,
    hardRule: null,
    actions,
  };
}

/**
 * Answers a cash buyer who replied about a deal being marketed: rules
 * first, then one mid-tier call that classifies the reply and drafts the
 * answer. The model sees the deal as a buyer does (the buyer price, ARV,
 * repairs), never the seller side. Every draft waits for a person and then
 * goes through the communications approval queue like any email.
 */
export class BuyerResponderAgent {
  constructor(
    private readonly opts: {
      models?: AgentModels | null;
      chat?: typeof chatCompletion;
    } = {},
  ) {}

  async run(
    ctx: BuyerReplyContext,
    accountId: string,
    runId: string,
  ): Promise<LeadAnalystResult> {
    const rule = decideByRule(ctx);
    if (rule) return { decision: rule, costUsd: 0 };

    const inbound = ctx.inbound as NonNullable<BuyerReplyContext['inbound']>;
    const buyer = ctx.buyer as NonNullable<BuyerReplyContext['buyer']>;
    const price = buyerPriceFor(ctx);
    const model = resolveAgentModel(
      AGENT_TIER.buyer_responder,
      this.opts.models,
    );
    const modelContext = {
      deal: {
        id: ctx.deal.id,
        stage: ctx.deal.stage,
        askingPrice: price?.price ?? null,
        arv: ctx.deal.arv,
        repairEstimate: ctx.deal.repairEstimate,
      },
      property: ctx.property,
      buyer: {
        name: buyer.name,
        preferences: buyer.preferences,
        engagementScore: buyer.engagementScore,
      },
      thread: ctx.thread.map((m) => ({
        direction: m.direction,
        channel: m.channel,
        at: m.at,
        subject: m.subject,
        content: m.content,
      })),
      inbound: {
        channel: inbound.channel,
        subject: inbound.subject,
        content: inbound.content,
        at: inbound.at,
      },
      team: ctx.team,
    };
    const user = prompts.buyer_responder.user
      .split('{{context}}')
      .join(JSON.stringify(modelContext, null, 1).slice(0, MAX_CONTEXT_CHARS))
      .split('{{channel}}')
      .join(inbound.channel);
    const chat = this.opts.chat ?? chatCompletion;
    const completion = await chat(accountId, {
      model,
      messages: [
        { role: 'system', content: prompts.buyer_responder.system },
        { role: 'user', content: user },
      ],
      temperature: 0.3,
      maxTokens: 700,
      dealId: ctx.deal.id,
      automationRunId: runId,
      workflow: agentWorkflow('buyer_responder'),
    });
    const costUsd = estimateAiCostUsd(
      completion.model,
      completion.tokensIn,
      completion.tokensOut,
    );
    const out = parseBuyerResponderOutput(completion.content);
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
