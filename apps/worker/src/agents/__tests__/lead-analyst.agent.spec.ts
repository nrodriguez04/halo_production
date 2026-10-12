import type { chatCompletion } from '../../internal-api.client';
import type { LeadAnalystContext } from '../agent-context';
import {
  AgentOutputError,
  LeadAnalystAgent,
  decisionFromHardRule,
  hardRule,
} from '../lead-analyst.agent';

function ctx(
  over: Partial<LeadAnalystContext> = {},
  lead: Partial<LeadAnalystContext['lead']> = {},
): LeadAnalystContext {
  return {
    lead: {
      id: 'lead-1',
      status: 'enriched',
      score: null,
      tags: ['owner:absentee'],
      address: { street: '123 Main St', city: 'Austin', state: 'TX', zip: '78701' },
      ownerName: 'Owner LLC',
      createdAt: '2026-10-01T00:00:00.000Z',
      daysInStatus: 2,
      hasPhone: true,
      hasEmail: true,
      dealCount: 0,
      ...lead,
    },
    properties: [
      {
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        estimatedValue: 250000,
        salePrice: null,
      },
    ],
    sources: [
      {
        provider: 'attom',
        endpoint: 'property/detail',
        summary: { propertyType: 'SFR', yearBuilt: 1975 },
      },
    ],
    enrichment: null,
    dnc: false,
    consents: { sms: false, email: false },
    timeline: [],
    ...over,
  };
}

const completion = (content: string, model = 'gpt-4o') => ({
  content,
  model,
  tokensIn: 1200,
  tokensOut: 300,
});

const qualifiedReply = JSON.stringify({
  score: 82,
  recommendation: 'qualified',
  rationale: 'Absentee owner with equity and a long hold.',
  signals: ['absentee', 'equity'],
  first_touch_sms: 'Hi, I am reaching out about 123 Main St. Would you consider an offer?',
  first_touch_email: {
    subject: 'Your property at 123 Main St',
    body: 'Hello, I buy houses in Austin and would like to make you an offer.',
  },
});

describe('hardRule', () => {
  it('disqualifies do-not-call contacts before any model call', () => {
    expect(hardRule(ctx({ dnc: true }))).toMatchObject({
      recommendation: 'disqualified',
      rule: 'dnc',
    });
  });

  it('disqualifies leads with no usable address', () => {
    const noStreet = ctx({}, { address: { street: '', city: 'Austin', state: 'TX', zip: '78701' } });
    expect(hardRule(noStreet)).toMatchObject({ rule: 'no_address' });
    const noZip = ctx({}, { address: { street: '1 Main', city: 'Austin', state: 'TX', zip: '' } });
    expect(hardRule(noZip)).toMatchObject({ rule: 'no_address' });
  });

  it('disqualifies out-of-scope property types from source data or tags', () => {
    const land = ctx({
      sources: [{ provider: 'attom', endpoint: 'x', summary: { propertyType: 'Vacant Land' } }],
    });
    expect(hardRule(land)).toMatchObject({ rule: 'property_type' });
    expect(hardRule(ctx({}, { tags: ['commercial'] }))).toMatchObject({ rule: 'property_type' });
  });

  it('holds owner-occupied leads without a distress signal and passes distressed ones', () => {
    expect(hardRule(ctx({}, { tags: ['owner:occupied'] }))).toMatchObject({
      recommendation: 'hold',
      rule: 'owner_occupied_no_distress',
    });
    expect(hardRule(ctx({}, { tags: ['owner:occupied', 'tax:delinquent'] }))).toBeNull();
  });

  it('passes a plain absentee lead through to the model', () => {
    expect(hardRule(ctx())).toBeNull();
  });
});

describe('decisionFromHardRule', () => {
  it('turns a disqualify into score, note and an ungated transition', () => {
    const d = decisionFromHardRule({
      recommendation: 'disqualified',
      rule: 'dnc',
      reason: 'Contact is on the do-not-call list',
    });
    expect(d.model).toBeNull();
    expect(d.hardRule).toBe('dnc');
    expect(d.actions).toEqual([
      { type: 'set_lead_score', score: 5 },
      { type: 'append_note', note: 'Contact is on the do-not-call list (rule: dnc)' },
      {
        type: 'transition_lead',
        to: 'disqualified',
        reason: 'Contact is on the do-not-call list',
        gated: false,
      },
    ]);
  });

  it('turns a hold into score and note only', () => {
    const d = decisionFromHardRule({
      recommendation: 'hold',
      rule: 'owner_occupied_no_distress',
      reason: 'Owner-occupied',
    });
    expect(d.actions.map((a) => a.type)).toEqual(['set_lead_score', 'append_note']);
    expect(d.actions[0]).toEqual({ type: 'set_lead_score', score: 40 });
  });
});

describe('LeadAnalystAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: { mid?: string } | null = null) =>
    new LeadAnalystAgent({ models, chat: chat as unknown as typeof chatCompletion });

  beforeEach(() => {
    chat.mockReset();
  });

  it('costs nothing and never calls the model when a rule answers', async () => {
    const res = await agent().run(ctx({ dnc: true }), 'acct', 'run-1');
    expect(chat).not.toHaveBeenCalled();
    expect(res.costUsd).toBe(0);
    expect(res.decision).toMatchObject({ recommendation: 'disqualified', hardRule: 'dnc' });
  });

  it('asks the mid-tier model through the cost-governed route with the lead attributed', async () => {
    chat.mockResolvedValue(completion(qualifiedReply));
    const context = ctx({}, { tags: ['owner:absentee', 'note:$250k-arv'] });

    await agent().run(context, 'acct', 'run-1');

    expect(chat).toHaveBeenCalledTimes(1);
    const [accountId, input] = chat.mock.calls[0];
    expect(accountId).toBe('acct');
    expect(input).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 900,
      leadId: 'lead-1',
      automationRunId: 'run-1',
      workflow: 'agent:lead_analyst',
    });
    expect(input.messages[0].role).toBe('system');
    expect(input.messages[1].content).toContain('"id": "lead-1"');
    // "$" in the context must survive templating (String.replace would eat it).
    expect(input.messages[1].content).toContain('note:$250k-arv');
    expect(input.messages[1].content).not.toContain('{{leadContext}}');
  });

  it('maps a qualified reply to a gated transition plus first-touch drafts', async () => {
    chat.mockResolvedValue(completion(qualifiedReply));

    const res = await agent().run(ctx(), 'acct', 'run-1');

    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.decision).toMatchObject({
      agent: 'lead_analyst',
      model: 'gpt-4o',
      recommendation: 'qualified',
      hardRule: null,
    });
    expect(res.decision.summary).toContain('82/100');
    expect(res.decision.actions).toEqual([
      { type: 'set_lead_score', score: 82 },
      { type: 'append_note', note: 'Absentee owner with equity and a long hold.' },
      {
        type: 'transition_lead',
        to: 'qualified',
        reason: 'Lead Analyst recommendation',
        gated: true,
      },
      {
        type: 'draft_message',
        channel: 'sms',
        recipientType: 'seller',
        content: 'Hi, I am reaching out about 123 Main St. Would you consider an offer?',
        gated: true,
      },
      {
        type: 'draft_message',
        channel: 'email',
        recipientType: 'seller',
        content: 'Hello, I buy houses in Austin and would like to make you an offer.',
        subject: 'Your property at 123 Main St',
        gated: true,
      },
    ]);
  });

  it('maps a model disqualify to a gated transition, never an immediate one', async () => {
    chat.mockResolvedValue(
      completion(
        JSON.stringify({
          score: 12,
          recommendation: 'disqualified',
          rationale: 'Recently sold at market value.',
          signals: ['recent sale'],
        }),
      ),
    );

    const res = await agent().run(ctx(), 'acct', 'run-1');

    expect(res.decision.actions).toEqual([
      { type: 'set_lead_score', score: 12 },
      { type: 'append_note', note: 'Recently sold at market value.' },
      {
        type: 'transition_lead',
        to: 'disqualified',
        reason: 'Recently sold at market value.',
        gated: true,
      },
    ]);
  });

  it('honours the tenant model override for the tier', async () => {
    chat.mockResolvedValue(completion(qualifiedReply, 'claude-sonnet-5-5'));

    const res = await agent({ mid: 'claude-sonnet-5-5' }).run(ctx(), 'acct', 'run-1');

    expect(chat.mock.calls[0][1].model).toBe('claude-sonnet-5-5');
    expect(res.decision.model).toBe('claude-sonnet-5-5');
  });

  it('throws AgentOutputError, keeping the raw reply, when the model did not answer in JSON', async () => {
    chat.mockResolvedValue(completion('I cannot help with that.'));

    const err = await agent()
      .run(ctx(), 'acct', 'run-1')
      .catch((e) => e);

    expect(err).toBeInstanceOf(AgentOutputError);
    expect((err as AgentOutputError).raw).toBe('I cannot help with that.');
  });
});
