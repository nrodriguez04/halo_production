import type { chatCompletion } from '../../internal-api.client';
import type { DispositionBuyer, DispositionContext } from '../disposition-context';
import { AgentOutputError } from '../lead-analyst.agent';
import {
  DispositionMatcherAgent,
  decideByRule,
  scoreBuyers,
  targetPrice,
} from '../disposition-matcher.agent';

function buyer(over: Partial<DispositionBuyer> & { id: string; name: string }): DispositionBuyer {
  return {
    preferences: null,
    engagementScore: 0,
    lastContacted: null,
    hasEmail: true,
    hasPhone: false,
    history: { sent: 0, replies: 0, lastReplyAt: null },
    ...over,
  };
}

const sarah = buyer({
  id: 'b-sarah',
  name: 'Sarah Johnson',
  preferences: { locations: ['Memphis', 'Jacksonville'], priceRange: { min: 100000, max: 250000 } },
  engagementScore: 9.6,
  history: { sent: 3, replies: 2, lastReplyAt: '2026-09-30T00:00:00.000Z' },
});
const lisa = buyer({
  id: 'b-lisa',
  name: 'Lisa Rodriguez',
  preferences: { locations: ['Dallas', 'San Antonio'], priceRange: { min: 200000, max: 500000 } },
  engagementScore: 7.9,
});
const open = buyer({ id: 'b-open', name: 'Open Buyer', engagementScore: 1 });
const noEmail = buyer({
  id: 'b-noemail',
  name: 'No Email',
  preferences: { locations: ['Memphis'] },
  engagementScore: 10,
  hasEmail: false,
});

function ctx(over: Partial<DispositionContext> = {}): DispositionContext {
  return {
    deal: {
      id: 'deal-1',
      stage: 'under_contract',
      arv: 220000,
      repairEstimate: 30000,
      mao: 115000,
      offerAmount: 120000,
    },
    property: { address: '654 Birch Rd', city: 'Memphis', state: 'TN', zip: '38103', estimatedValue: 200000 },
    underwriting: { confidence: 0.7, offerRange: { low: 100000, high: 115000 }, rationale: 'r' },
    buyers: [sarah, lisa, open, noEmail],
    priorBlasts: [],
    team: { name: 'Halo' },
    ...over,
  };
}

const completion = (content: string, model = 'gpt-4o') => ({ content, model, tokensIn: 1500, tokensOut: 300 });
const reply = (o: Record<string, unknown> = {}) =>
  completion(
    JSON.stringify({
      shortlist: [
        { buyer_id: 'b-sarah', fit: 'strong', reason: 'Memphis SFH buyer, replied twice' },
        { buyer_id: 'b-open', fit: 'possible', reason: 'No stated box' },
        { buyer_id: 'b-ghost', fit: 'strong', reason: 'not a candidate' },
      ],
      blast: { subject: 'Memphis SFH under contract', body: '654 Birch Rd, Memphis. Asking $120,000. ARV $220,000, repairs $30,000. Reply if interested.' },
      rationale: 'Sarah fits on location, price and responsiveness.',
      ...o,
    }),
  );

describe('Disposition Matcher scoring', () => {
  it('uses the offer amount, then MAO, then 70% of ARV as the price to match', () => {
    expect(targetPrice(ctx())).toBe(120000);
    expect(targetPrice(ctx({ deal: { ...ctx().deal, offerAmount: null } }))).toBe(115000);
    expect(targetPrice(ctx({ deal: { ...ctx().deal, offerAmount: null, mao: null } }))).toBe(154000);
  });

  it('scores location, price range, engagement and replies, and excludes buyers with no email', () => {
    const scored = scoreBuyers(ctx());
    const byId = Object.fromEntries(scored.map((s) => [s.buyer.id, s]));
    expect(byId['b-sarah'].score).toBe(40 + 30 + 19 + 10);
    expect(byId['b-sarah'].notes).toEqual(['city match', 'price in range', '2 past replies']);
    expect(byId['b-lisa'].score).toBe(0 + 0 + 16);
    expect(byId['b-lisa'].notes).toEqual(['outside stated locations', 'price outside range']);
    expect(byId['b-open'].score).toBe(10 + 10 + 2);
    expect(byId['b-noemail'].excluded).toBe('no email on file');
    expect(scored.map((s) => s.buyer.id)).toEqual(['b-sarah', 'b-open', 'b-lisa', 'b-noemail']);
  });

  it('holds without a model when there is no property, no buyers or no emailable buyer', () => {
    expect(decideByRule(ctx({ property: null }))).toMatchObject({ hardRule: 'no_property' });
    expect(decideByRule(ctx({ buyers: [] }))).toMatchObject({ hardRule: 'no_buyers' });
    expect(decideByRule(ctx({ buyers: [noEmail] }))).toMatchObject({ hardRule: 'no_contactable_buyers' });
    expect(decideByRule(ctx())).toBeNull();
  });
});

describe('DispositionMatcherAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: Record<string, string> | null = null) =>
    new DispositionMatcherAgent({ models, chat: chat as unknown as typeof chatCompletion });

  beforeEach(() => chat.mockReset());

  it('sends only emailable candidates to the mid tier and turns the reply into a ranking plus a gated blast', async () => {
    chat.mockResolvedValue(reply());

    const res = await agent().run(ctx(), 'acct', 'run-1');

    const [, input] = chat.mock.calls[0];
    expect(input).toMatchObject({
      model: 'gpt-4o',
      dealId: 'deal-1',
      automationRunId: 'run-1',
      workflow: 'agent:disposition_matcher',
    });
    const user = input.messages[1].content as string;
    expect(user).toContain('"buyer_id": "b-sarah"');
    expect(user).not.toContain('b-noemail');
    expect(user).toContain('shortlist at most 10 buyers');

    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.decision).toMatchObject({
      agent: 'disposition_matcher',
      recommendation: 'market',
      summary: 'market: 2 of 3 buyers shortlisted (1 strong); blast drafted',
    });
    expect(res.decision.actions).toEqual([
      {
        type: 'rank_buyers',
        consideredCount: 3,
        shortlist: [
          { buyerId: 'b-sarah', name: 'Sarah Johnson', rank: 1, fit: 'strong', reason: 'Memphis SFH buyer, replied twice', ruleScore: 99 },
          { buyerId: 'b-open', name: 'Open Buyer', rank: 2, fit: 'possible', reason: 'No stated box', ruleScore: 22 },
        ],
      },
      { type: 'append_note', note: 'Sarah fits on location, price and responsiveness.' },
      {
        type: 'queue_buyer_blast',
        buyerIds: ['b-sarah', 'b-open'],
        subject: 'Memphis SFH under contract',
        body: '654 Birch Rd, Memphis. Asking $120,000. ARV $220,000, repairs $30,000. Reply if interested.',
        gated: true,
      },
    ]);
  });

  it('holds when the model shortlists nobody, recording the empty ranking', async () => {
    chat.mockResolvedValue(reply({ shortlist: [], blast: null, rationale: 'Nobody buys in Memphis at this price.' }));
    const res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.recommendation).toBe('hold');
    expect(res.decision.actions.map((a) => a.type)).toEqual(['rank_buyers', 'append_note']);
    expect(res.decision.summary).toBe('hold: no buyer fits (3 considered)');
  });

  it('honours the tenant mid-tier override', async () => {
    chat.mockResolvedValue(reply());
    await agent({ mid: 'claude-sonnet-5-5' }).run(ctx(), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].model).toBe('claude-sonnet-5-5');
  });

  it('throws AgentOutputError on a non-JSON reply', async () => {
    chat.mockResolvedValue(completion('Top buyers: Sarah, then Lisa.'));
    await expect(agent().run(ctx(), 'acct', 'run-1')).rejects.toBeInstanceOf(AgentOutputError);
  });
});
