import type { chatCompletion } from '../../internal-api.client';
import { AgentOutputError } from '../lead-analyst.agent';
import type { OutreachContext } from '../outreach-context';
import {
  OutreachDrafterAgent,
  decideByRule,
  draftChannel,
} from '../outreach-drafter.agent';

function ctx(over: Partial<OutreachContext> = {}): OutreachContext {
  return {
    trigger: 'inbound',
    entity: { type: 'deal', id: 'deal-1' },
    deal: {
      id: 'deal-1',
      stage: 'contacted',
      arv: 250000,
      mao: 130000,
      offerAmount: null,
      createdAt: '2026-10-01T00:00:00.000Z',
    },
    lead: {
      id: 'lead-1',
      status: 'qualified',
      score: 80,
      tags: ['owner:absentee'],
      ownerName: 'Pat Owner',
      hasPhone: true,
      hasEmail: false,
    },
    property: { address: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
    compliance: { dnc: false, consents: { sms: true, email: false } },
    thread: [
      {
        id: 'm-out-1',
        direction: 'outbound',
        channel: 'sms',
        status: 'delivered',
        at: '2026-10-10T15:00:00.000Z',
        content: 'Hi Pat, this is the Halo team about 123 Main St. Open to an offer?',
      },
      {
        id: 'm-in-1',
        direction: 'inbound',
        channel: 'sms',
        status: 'delivered',
        at: '2026-10-11T09:00:00.000Z',
        content: 'Maybe. What are you thinking?',
      },
    ],
    inbound: {
      id: 'm-in-1',
      channel: 'sms',
      content: 'Maybe. What are you thinking?',
      at: '2026-10-11T09:00:00.000Z',
    },
    followUps: {
      outboundSinceLastInbound: 0,
      lastOutboundAt: '2026-10-10T15:00:00.000Z',
      lastInboundAt: '2026-10-11T09:00:00.000Z',
    },
    team: { name: 'Halo' },
    ...over,
  };
}

const followUpCtx = (sent = 1) =>
  ctx({
    trigger: 'sweep',
    inbound: null,
    thread: [
      {
        id: 'm-out-1',
        direction: 'outbound',
        channel: 'sms',
        status: 'delivered',
        at: '2026-10-08T15:00:00.000Z',
        content: 'Hi Pat, this is the Halo team about 123 Main St.',
      },
    ],
    followUps: {
      outboundSinceLastInbound: sent,
      lastOutboundAt: '2026-10-08T15:00:00.000Z',
      lastInboundAt: null,
    },
  });

const completion = (content: string, model = 'gpt-4o') => ({
  content,
  model,
  tokensIn: 900,
  tokensOut: 150,
});

const reply = (o: Record<string, unknown>) =>
  completion(
    JSON.stringify({
      intent: 'interested',
      confidence: 0.85,
      reply: { body: 'Thanks Pat. Happy to walk you through how we work. Is a quick call this week ok?' },
      rationale: 'Seller is open and asked a question.',
      next_step: 'Set a call',
      ...o,
    }),
  );

describe('Outreach Drafter rules', () => {
  it('records an opt-out phrase on its own, with no model and no draft', () => {
    const d = decideByRule(
      ctx({ inbound: { ...ctx().inbound!, content: 'Please stop texting me' } }),
    );
    expect(d).toMatchObject({ recommendation: 'opt_out', hardRule: 'opt_out_phrase', model: null });
    expect(d!.actions).toEqual([
      { type: 'classify_inbound', messageId: 'm-in-1', intent: 'opt_out', confidence: 1, method: 'rule' },
      { type: 'record_opt_out', messageId: 'm-in-1', reason: 'Seller wrote: "Please stop texting me"', gated: false },
      expect.objectContaining({ type: 'append_note' }),
    ]);
  });

  it('flags a wrong number for a new skip trace', () => {
    const d = decideByRule(
      ctx({ inbound: { ...ctx().inbound!, content: 'wrong number, never owned that house' } }),
    );
    expect(d).toMatchObject({ recommendation: 'wrong_number' });
    expect(d!.actions.map((a) => a.type)).toEqual(['classify_inbound', 'flag_contact', 'append_note']);
  });

  it('holds on DNC, on the follow-up cap, with no seller and with no contact', () => {
    expect(decideByRule(ctx({ compliance: { dnc: true, consents: { sms: false, email: false } } }))).toMatchObject({
      hardRule: 'dnc',
    });
    expect(decideByRule(followUpCtx(3))).toMatchObject({ hardRule: 'follow_up_cap' });
    expect(decideByRule(ctx({ lead: null }))).toMatchObject({ hardRule: 'no_lead' });
    expect(
      decideByRule(followUpCtx(1) && { ...followUpCtx(1), lead: { ...ctx().lead!, hasPhone: false } }),
    ).toMatchObject({ hardRule: 'no_contact' });
    expect(decideByRule(ctx())).toBeNull();
    expect(decideByRule(followUpCtx(1))).toBeNull();
  });

  it('replies on the inbound channel and follows up by text when there is a phone', () => {
    expect(draftChannel(ctx({ inbound: { ...ctx().inbound!, channel: 'email' } }))).toBe('email');
    expect(draftChannel(followUpCtx())).toBe('sms');
    expect(draftChannel({ ...followUpCtx(), lead: { ...ctx().lead!, hasPhone: false, hasEmail: true } })).toBe('email');
  });
});

describe('OutreachDrafterAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: Record<string, string> | null = null) =>
    new OutreachDrafterAgent({ models, chat: chat as unknown as typeof chatCompletion });

  beforeEach(() => chat.mockReset());

  it('classifies an interested reply, drafts the answer and asks to move the deal forward', async () => {
    chat.mockResolvedValue(reply({}));

    const res = await agent().run(ctx(), 'acct', 'run-1');

    const [, input] = chat.mock.calls[0];
    expect(input).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.4,
      leadId: 'lead-1',
      dealId: 'deal-1',
      automationRunId: 'run-1',
      workflow: 'agent:outreach_drafter',
    });
    expect(input.messages[1].content).toContain('Classify the seller');
    expect(input.messages[1].content).toContain('Maybe. What are you thinking?');
    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.decision).toMatchObject({ recommendation: 'interested', confidence: 0.85, model: 'gpt-4o' });
    expect(res.decision.summary).toContain('reply drafted');
    expect(res.decision.actions).toEqual([
      { type: 'classify_inbound', messageId: 'm-in-1', intent: 'interested', confidence: 0.85, method: 'model' },
      { type: 'append_note', note: 'Seller is open and asked a question.' },
      {
        type: 'draft_message',
        channel: 'sms',
        recipientType: 'seller',
        content: 'Thanks Pat. Happy to walk you through how we work. Is a quick call this week ok?',
        subject: undefined,
        inReplyToMessageId: 'm-in-1',
        gated: true,
      },
      { type: 'transition_deal', to: 'negotiating', reason: 'Seller replied with interest', gated: true },
    ]);
  });

  it('turns a decline into a gated lost transition without a draft', async () => {
    chat.mockResolvedValue(reply({ intent: 'not_interested', confidence: 0.9, reply: null }));
    const res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.actions.map((a) => a.type)).toEqual([
      'classify_inbound',
      'append_note',
      'transition_deal',
    ]);
    expect(res.decision.actions[2]).toMatchObject({ to: 'lost', gated: true });
  });

  it('records a model opt-out on its own only when confident', async () => {
    chat.mockResolvedValue(reply({ intent: 'opt_out', confidence: 0.95, reply: null }));
    let res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.actions).toContainEqual(expect.objectContaining({ type: 'record_opt_out', gated: false }));

    chat.mockResolvedValue(reply({ intent: 'opt_out', confidence: 0.5, reply: null }));
    res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.actions).toContainEqual(expect.objectContaining({ type: 'record_opt_out', gated: true }));
  });

  it('writes a follow-up from the sweep without classifying anything', async () => {
    chat.mockResolvedValue(
      reply({ intent: 'follow_up', confidence: 0.7, reply: { body: 'Hi Pat, still happy to talk whenever suits you. Mornings or afternoons better?' } }),
    );
    const res = await agent().run(followUpCtx(1), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].messages[1].content).toContain('Write one short follow-up');
    expect(res.decision.actions.map((a) => a.type)).toEqual(['append_note', 'draft_message']);
    expect(res.decision.actions[1]).toMatchObject({ channel: 'sms', gated: true, inReplyToMessageId: undefined });
    expect(res.decision.summary).toBe('follow_up: sms follow-up drafted');
  });

  it('uses the strong tier for negotiation on a valuable deal', async () => {
    chat.mockResolvedValue(reply({ intent: 'callback', confidence: 0.8 }, ));
    const models = { mid: 'gpt-4o-mini', strong: 'claude-opus-5-5' };
    await agent(models).run(ctx({ deal: { ...ctx().deal!, stage: 'negotiating', arv: 650000 } }), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].model).toBe('claude-opus-5-5');
    await agent(models).run(ctx(), 'acct', 'run-1');
    expect(chat.mock.calls[1][1].model).toBe('gpt-4o-mini');
  });

  it('throws AgentOutputError on a non-JSON reply', async () => {
    chat.mockResolvedValue(completion('Sure! Here is a reply: Thanks Pat.'));
    await expect(agent().run(ctx(), 'acct', 'run-1')).rejects.toBeInstanceOf(AgentOutputError);
  });
});
