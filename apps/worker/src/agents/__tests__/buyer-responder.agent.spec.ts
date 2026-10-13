import type { chatCompletion } from '../../internal-api.client';
import type { BuyerReplyContext } from '../buyer-context';
import { AgentOutputError } from '../lead-analyst.agent';
import {
  BuyerResponderAgent,
  buyerPriceFor,
  decideByRule,
  replySubject,
} from '../buyer-responder.agent';

function ctx(over: Partial<BuyerReplyContext> = {}): BuyerReplyContext {
  return {
    trigger: 'inbound',
    deal: {
      id: 'deal-1',
      stage: 'marketing',
      arv: 172000,
      repairEstimate: 32000,
      mao: 78400,
      offerAmount: 72000,
      contractPrice: null,
      assignmentPrice: null,
      assignmentFee: null,
    },
    defaultAssignmentFee: 10000,
    property: {
      address: '2418 Pecan Grove Dr',
      city: 'Memphis',
      state: 'TN',
      zip: '38116',
      estimatedValue: 142000,
    },
    buyer: {
      id: 'b-1',
      name: 'Riverbend Renovations',
      preferences: { locations: ['Memphis'] },
      engagementScore: 8,
      hasEmail: true,
      hasPhone: false,
    },
    compliance: { optedOut: false },
    thread: [
      {
        id: 'msg-out',
        direction: 'outbound',
        channel: 'email',
        status: 'delivered',
        at: '2026-10-09T15:00:00.000Z',
        subject: 'Off-market Memphis deal: 2418 Pecan Grove Dr, $82,000',
        content: 'Asking: $82,000',
      },
    ],
    inbound: {
      id: 'msg-in',
      channel: 'email',
      subject: 'Re: Off-market Memphis deal: 2418 Pecan Grove Dr, $82,000',
      content: 'Interested. Can I walk it this week?',
      at: '2026-10-09T18:20:00.000Z',
    },
    team: { name: 'Halo Home Buyers' },
    ...over,
  };
}

const completion = (content: string, model = 'gpt-4o') => ({
  content,
  model,
  tokensIn: 1400,
  tokensOut: 250,
});
const reply = (o: Record<string, unknown> = {}) =>
  completion(
    JSON.stringify({
      intent: 'interested',
      confidence: 0.9,
      reply: {
        body: 'Thanks. What times work for a walkthrough? We will need proof of funds and an earnest money deposit.',
        subject: null,
      },
      offer: null,
      rationale: 'Wants to see it.',
      ...o,
    }),
  );

describe('Buyer Responder rules', () => {
  it('prices the deal for buyers: the offer to the seller plus the fee', () => {
    expect(buyerPriceFor(ctx())).toMatchObject({
      price: 82000,
      basis: 'offer',
    });
  });

  it('records an opt-out at once and drafts nothing', () => {
    const d = decideByRule(
      ctx({
        inbound: { ...ctx().inbound!, content: 'Please unsubscribe me.' },
      }),
    );
    expect(d).toMatchObject({
      hardRule: 'opt_out_phrase',
      recommendation: 'opt_out',
    });
    expect(d!.actions.map((a) => a.type)).toEqual([
      'classify_inbound',
      'record_opt_out',
      'append_note',
    ]);
    expect(d!.actions.find((a) => a.type === 'record_opt_out')).toMatchObject({
      gated: false,
    });
  });

  it('holds for a buyer on the do-not-contact list and for a reply with no buyer', () => {
    expect(decideByRule(ctx({ compliance: { optedOut: true } }))).toMatchObject(
      {
        hardRule: 'opted_out',
      },
    );
    expect(decideByRule(ctx({ buyer: null }))).toMatchObject({
      hardRule: 'no_buyer',
    });
    expect(decideByRule(ctx({ inbound: null }))).toMatchObject({
      hardRule: 'no_inbound',
    });
  });

  it('answers a deal that is gone from a template, with no model and no price', () => {
    const d = decideByRule(ctx({ deal: { ...ctx().deal, stage: 'assigned' } }));
    expect(d).toMatchObject({
      hardRule: 'deal_unavailable',
      recommendation: 'unavailable',
    });
    const draft = d!.actions.find((a) => a.type === 'draft_message');
    expect(draft).toMatchObject({
      channel: 'email',
      recipientType: 'buyer',
      buyerId: 'b-1',
      inReplyToMessageId: 'msg-in',
      subject: 'Re: Off-market Memphis deal: 2418 Pecan Grove Dr, $82,000',
      gated: true,
    });
    expect((draft as { content: string }).content).toContain(
      'no longer available',
    );
    expect((draft as { content: string }).content).not.toMatch(/\$/);
  });

  it('asks the model otherwise', () => {
    expect(decideByRule(ctx())).toBeNull();
  });

  it('keeps one Re: on a reply subject', () => {
    expect(replySubject('Deal')).toBe('Re: Deal');
    expect(replySubject('RE: Deal')).toBe('RE: Deal');
    expect(replySubject(null)).toBeUndefined();
  });
});

describe('BuyerResponderAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: Record<string, string> | null = null) =>
    new BuyerResponderAgent({
      models,
      chat: chat as unknown as typeof chatCompletion,
    });

  beforeEach(() => chat.mockReset());

  it('shows the model the buyer price only and drafts a gated reply to the buyer', async () => {
    chat.mockResolvedValue(reply());
    const res = await agent().run(ctx(), 'acct', 'run-1');

    const [, input] = chat.mock.calls[0];
    expect(input).toMatchObject({
      model: 'gpt-4o',
      dealId: 'deal-1',
      automationRunId: 'run-1',
      workflow: 'agent:buyer_responder',
    });
    const user = input.messages[1].content as string;
    expect(user).toContain('"askingPrice": 82000');
    expect(user).toContain('reply on the email channel');
    // The seller side never reaches the model.
    expect(user).not.toMatch(/\b72000\b/);
    expect(user).not.toMatch(/\b78400\b/);
    expect(user).not.toContain('offerAmount');
    expect(user).not.toContain('mao');

    expect(res.decision).toMatchObject({
      agent: 'buyer_responder',
      recommendation: 'interested',
      hardRule: null,
    });
    expect(res.decision.actions).toEqual([
      {
        type: 'classify_inbound',
        messageId: 'msg-in',
        intent: 'interested',
        confidence: 0.9,
        method: 'model',
      },
      { type: 'append_note', note: 'Wants to see it.' },
      {
        type: 'draft_message',
        channel: 'email',
        recipientType: 'buyer',
        buyerId: 'b-1',
        content:
          'Thanks. What times work for a walkthrough? We will need proof of funds and an earnest money deposit.',
        subject: 'Re: Off-market Memphis deal: 2418 Pecan Grove Dr, $82,000',
        inReplyToMessageId: 'msg-in',
        gated: true,
      },
    ]);
  });

  it('records an offer in the note and the summary without accepting anything', async () => {
    chat.mockResolvedValue(
      reply({
        intent: 'offer',
        offer: { amount: 70000, terms: 'cash, 10-day close' },
        reply: {
          body: 'Thanks, we will review it with the team.',
          subject: 'Re: deal',
        },
        rationale: 'Below asking.',
      }),
    );
    const res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.summary).toContain('offer $70,000');
    expect(res.decision.actions).toContainEqual({
      type: 'append_note',
      note: 'Below asking. Offer: $70,000, cash, 10-day close.',
    });
    expect(res.decision.actions.map((a) => a.type)).not.toContain(
      'transition_deal',
    );
  });

  it('drafts nothing after a model opt-out and gates an unsure one', async () => {
    chat.mockResolvedValue(
      reply({ intent: 'opt_out', confidence: 0.6, reply: null }),
    );
    const res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.actions.map((a) => a.type)).not.toContain(
      'draft_message',
    );
    expect(
      res.decision.actions.find((a) => a.type === 'record_opt_out'),
    ).toMatchObject({
      gated: true,
    });
  });

  it('answers a text with a text', async () => {
    chat.mockResolvedValue(
      reply({ reply: { body: 'Yes, still available.', subject: null } }),
    );
    const sms = ctx({
      inbound: {
        ...ctx().inbound!,
        channel: 'sms',
        subject: null,
        content: 'Still available?',
      },
    });
    const res = await agent().run(sms, 'acct', 'run-1');
    expect(
      res.decision.actions.find((a) => a.type === 'draft_message'),
    ).toMatchObject({
      channel: 'sms',
      subject: undefined,
    });
  });

  it('honours the tenant mid-tier override', async () => {
    chat.mockResolvedValue(reply());
    await agent({ mid: 'claude-sonnet-5-5' }).run(ctx(), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].model).toBe('claude-sonnet-5-5');
  });

  it('throws AgentOutputError on a reply that is not JSON', async () => {
    chat.mockResolvedValue(completion('Sure, Thursday works.'));
    await expect(agent().run(ctx(), 'acct', 'run-1')).rejects.toBeInstanceOf(
      AgentOutputError,
    );
  });
});
