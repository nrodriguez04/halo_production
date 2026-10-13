import type { chatCompletion } from '../../internal-api.client';
import type { DealUnderwriterContext } from '../deal-context';
import { AgentOutputError } from '../lead-analyst.agent';
import {
  DealUnderwriterAgent,
  decisionFromHardRule,
  hardRule,
} from '../deal-underwriter.agent';

function ctx(over: Partial<DealUnderwriterContext> = {}): DealUnderwriterContext {
  return {
    deal: {
      id: 'deal-1',
      stage: 'contacted',
      arv: null,
      repairEstimate: null,
      mao: null,
      offerAmount: null,
      assignmentFee: 12500,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-12T10:00:00.000Z',
    },
    property: {
      address: '123 Main St',
      city: 'Austin',
      state: 'TX',
      zip: '78701',
      apn: '0123',
      estimatedValue: 260000,
      salePrice: null,
    },
    lead: { status: 'qualified', score: 80, tags: ['owner:absentee'] },
    sources: [
      {
        provider: 'attom',
        endpoint: 'property/detail',
        summary: { propertyType: 'SFR', yearBuilt: 1975, assessedValue: 210000 },
      },
    ],
    priorResult: null,
    timeline: [],
    ...over,
  };
}

const completion = (content: string, model = 'gpt-4o') => ({
  content,
  model,
  tokensIn: 2000,
  tokensOut: 400,
});

const offerReply = JSON.stringify({
  arv: 250000,
  repair_estimate: 35000,
  mao: 130000,
  offer_low: 110000,
  offer_high: 130000,
  confidence: 0.72,
  recommendation: 'offer',
  rationale: 'Assessment and listing data support a 250k ARV; moderate rehab.',
  comps_summary: 'Two nearby 2025 sales at 245k and 262k.',
});

describe('Deal Underwriter hard rule', () => {
  it('holds a deal with no usable property instead of asking the model', () => {
    expect(hardRule(ctx({ property: null }))).toMatchObject({ rule: 'no_property' });
    expect(
      hardRule(ctx({ property: { ...ctx().property!, zip: '' } })),
    ).toMatchObject({ rule: 'no_property' });
    expect(hardRule(ctx())).toBeNull();
    const d = decisionFromHardRule({ rule: 'no_property', reason: 'no property' });
    expect(d.recommendation).toBe('hold');
    expect(d.actions).toEqual([{ type: 'append_note', note: 'no property (rule: no_property)' }]);
  });
});

describe('DealUnderwriterAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: { strong?: string } | null = null) =>
    new DealUnderwriterAgent({ models, chat: chat as unknown as typeof chatCompletion });

  beforeEach(() => chat.mockReset());

  it('skips the model when the rule answers', async () => {
    const res = await agent().run(ctx({ property: null }), 'acct', 'run-1');
    expect(chat).not.toHaveBeenCalled();
    expect(res.costUsd).toBe(0);
    expect(res.decision.hardRule).toBe('no_property');
  });

  it('asks the strong tier with the deal attributed and turns the reply into guarded numbers', async () => {
    chat.mockResolvedValue(completion(offerReply));

    const res = await agent().run(ctx(), 'acct', 'run-1');

    const [accountId, input] = chat.mock.calls[0];
    expect(accountId).toBe('acct');
    expect(input).toMatchObject({
      model: 'gpt-4o',
      temperature: 0.2,
      maxTokens: 1200,
      dealId: 'deal-1',
      automationRunId: 'run-1',
      workflow: 'agent:deal_underwriter',
    });
    expect(input.messages[1].content).toContain('"address": "123 Main St"');
    expect(input.messages[1].content).not.toContain('{{dealContext}}');
    // The MAO subtracts the tenant's (or the deal's) fee, not a fixed one.
    expect(input.messages[1].content).toContain('"assignmentFee": 12500');
    expect(input.messages[1].content).toContain('repairs - deal.assignmentFee');

    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.decision).toMatchObject({
      agent: 'deal_underwriter',
      model: 'gpt-4o',
      recommendation: 'offer',
      confidence: 0.72,
      hardRule: null,
    });
    expect(res.decision.summary).toBe(
      'offer $110,000-$130,000: ARV $250,000, repairs $35,000, MAO $130,000, confidence 0.72',
    );
    expect(res.decision.actions).toEqual([
      {
        type: 'set_deal_economics',
        arv: 250000,
        repairEstimate: 35000,
        mao: 130000,
        confidence: 0.72,
        offerLow: 110000,
        offerHigh: 130000,
        rationale: 'Assessment and listing data support a 250k ARV; moderate rehab.',
        compsSummary: 'Two nearby 2025 sales at 245k and 262k.',
        dealUpdatedAt: '2026-10-12T10:00:00.000Z',
      },
      {
        type: 'append_note',
        note: 'Assessment and listing data support a 250k ARV; moderate rehab.',
      },
    ]);
  });

  it('uses the tenant strong-tier override', async () => {
    chat.mockResolvedValue(completion(offerReply, 'claude-opus-5-5'));
    const res = await agent({ strong: 'claude-opus-5-5' }).run(ctx(), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].model).toBe('claude-opus-5-5');
    expect(res.decision.model).toBe('claude-opus-5-5');
  });

  it('throws AgentOutputError on a non-JSON reply', async () => {
    chat.mockResolvedValue(completion('ARV: $250,000. MAO: $130,000.'));
    await expect(agent().run(ctx(), 'acct', 'run-1')).rejects.toBeInstanceOf(AgentOutputError);
  });
});
