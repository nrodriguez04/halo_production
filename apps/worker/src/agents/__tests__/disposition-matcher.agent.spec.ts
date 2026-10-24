import type { chatCompletion } from '../../internal-api.client';
import type {
  DispositionBuyer,
  DispositionContext,
} from '../disposition-context';
import { AgentOutputError } from '../lead-analyst.agent';
import {
  DispositionMatcherAgent,
  decideByRule,
  buyerPrice,
  scoreBuyers,
} from '../disposition-matcher.agent';

function buyer(
  over: Partial<DispositionBuyer> & { id: string; name: string },
): DispositionBuyer {
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
  preferences: {
    locations: ['Memphis', 'Jacksonville'],
    priceRange: { min: 100000, max: 250000 },
  },
  engagementScore: 9.6,
  history: { sent: 3, replies: 2, lastReplyAt: '2026-09-30T00:00:00.000Z' },
});
const lisa = buyer({
  id: 'b-lisa',
  name: 'Lisa Rodriguez',
  preferences: {
    locations: ['Dallas', 'San Antonio'],
    priceRange: { min: 200000, max: 500000 },
  },
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
      contractPrice: null,
      assignmentPrice: null,
      assignmentFee: null,
    },
    defaultAssignmentFee: 10000,
    property: {
      address: '654 Birch Rd',
      city: 'Memphis',
      state: 'TN',
      zip: '38103',
      estimatedValue: 200000,
    },
    underwriting: {
      confidence: 0.7,
      offerRange: { low: 100000, high: 115000 },
      rationale: 'r',
    },
    buyers: [sarah, lisa, open, noEmail],
    priorBlasts: [],
    team: { name: 'Halo' },
    ...over,
  };
}

const completion = (content: string, model = 'gpt-4o') => ({
  content,
  model,
  tokensIn: 1500,
  tokensOut: 300,
});
const reply = (o: Record<string, unknown> = {}) =>
  completion(
    JSON.stringify({
      shortlist: [
        {
          buyer_id: 'b-sarah',
          fit: 'strong',
          reason: 'Memphis SFH buyer, replied twice',
        },
        { buyer_id: 'b-open', fit: 'possible', reason: 'No stated box' },
        { buyer_id: 'b-ghost', fit: 'strong', reason: 'not a candidate' },
      ],
      blast: {
        subject: 'Memphis SFH under contract',
        body: '654 Birch Rd, Memphis. Asking $130,000. ARV $220,000, repairs $30,000. Reply if interested.',
      },
      rationale: 'Sarah fits on location, price and responsiveness.',
      ...o,
    }),
  );

describe('Disposition Matcher scoring', () => {
  it('prices buyers at the seller-side figure plus the fee, never at the seller figure itself', () => {
    const deal = ctx().deal;
    expect(buyerPrice(ctx())).toEqual({
      price: 130000,
      basis: 'offer',
      sellerPrice: 120000,
      fee: 10000,
    });
    expect(
      buyerPrice(ctx({ deal: { ...deal, offerAmount: null } })),
    ).toMatchObject({ price: 125000, basis: 'mao' });
    expect(
      buyerPrice(ctx({ deal: { ...deal, offerAmount: null, mao: null } })),
    ).toMatchObject({
      price: 124000,
      basis: 'arv',
    });
  });

  it('uses the asking price a person set, the contract price and the deal or tenant fee', () => {
    const deal = ctx().deal;
    expect(
      buyerPrice(ctx({ deal: { ...deal, assignmentPrice: 139000 } })),
    ).toMatchObject({
      price: 139000,
      basis: 'asking_price',
    });
    expect(
      buyerPrice(ctx({ deal: { ...deal, contractPrice: 118000 } })),
    ).toMatchObject({
      price: 128000,
      basis: 'contract_price',
    });
    expect(buyerPrice(ctx({ defaultAssignmentFee: 15000 }))?.price).toBe(
      135000,
    );
    expect(
      buyerPrice(
        ctx({
          deal: { ...deal, assignmentFee: 5000 },
          defaultAssignmentFee: 15000,
        }),
      )?.price,
    ).toBe(125000);
  });

  it('scores location, price range, engagement and replies, and excludes buyers with no email', () => {
    const scored = scoreBuyers(ctx());
    const byId = Object.fromEntries(scored.map((s) => [s.buyer.id, s]));
    expect(byId['b-sarah'].score).toBe(40 + 30 + 19 + 10);
    expect(byId['b-sarah'].notes).toEqual([
      'city match',
      'price in range',
      '2 past replies',
    ]);
    expect(byId['b-lisa'].score).toBe(0 + 0 + 16);
    expect(byId['b-lisa'].notes).toEqual([
      'outside stated locations',
      'price outside range',
    ]);
    expect(byId['b-open'].score).toBe(10 + 10 + 2);
    expect(byId['b-noemail'].excluded).toBe('no email on file');
    // A buyer whose stated locations miss the deal is excluded, like one with no email.
    expect(byId['b-lisa'].excluded).toBe(
      "outside the buyer's stated locations",
    );
    expect(scored.map((s) => s.buyer.id)).toEqual([
      'b-sarah',
      'b-open',
      'b-noemail',
      'b-lisa',
    ]);
  });

  it('holds without a model when there is no property, no buyers or no emailable buyer', () => {
    expect(decideByRule(ctx({ property: null }))).toMatchObject({
      hardRule: 'no_property',
    });
    expect(decideByRule(ctx({ buyers: [] }))).toMatchObject({
      hardRule: 'no_buyers',
    });
    expect(decideByRule(ctx({ buyers: [noEmail] }))).toMatchObject({
      hardRule: 'no_contactable_buyers',
    });
    expect(decideByRule(ctx())).toBeNull();
  });
});

describe('DispositionMatcherAgent.run', () => {
  const chat = jest.fn();
  const agent = (models: Record<string, string> | null = null) =>
    new DispositionMatcherAgent({
      models,
      chat: chat as unknown as typeof chatCompletion,
    });

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
    // The buyers' price only: the seller offer, the MAO and the offer range stay out.
    expect(user).toContain('"askingPrice": 130000');
    expect(user).not.toContain('120000');
    expect(user).not.toContain('115000');
    expect(user).not.toContain('offerRange');

    expect(res.costUsd).toBeGreaterThan(0);
    expect(res.decision).toMatchObject({
      agent: 'disposition_matcher',
      recommendation: 'market',
      summary:
        'market at $130,000 (offer to the seller + fee): 2 of 2 buyers shortlisted (1 strong); blast drafted',
    });
    expect(res.decision.actions).toEqual([
      {
        type: 'rank_buyers',
        consideredCount: 2,
        shortlist: [
          {
            buyerId: 'b-sarah',
            name: 'Sarah Johnson',
            rank: 1,
            fit: 'strong',
            reason: 'Memphis SFH buyer, replied twice',
            ruleScore: 99,
          },
          {
            buyerId: 'b-open',
            name: 'Open Buyer',
            rank: 2,
            fit: 'possible',
            reason: 'No stated box',
            ruleScore: 22,
          },
        ],
      },
      {
        type: 'append_note',
        note: 'Sarah fits on location, price and responsiveness.',
      },
      {
        type: 'queue_buyer_blast',
        buyerIds: ['b-sarah', 'b-open'],
        subject: 'Memphis SFH under contract',
        body: '654 Birch Rd, Memphis. Asking $130,000. ARV $220,000, repairs $30,000. Reply if interested.',
        gated: true,
      },
    ]);
  });

  it('holds when the model shortlists nobody, recording the empty ranking', async () => {
    chat.mockResolvedValue(
      reply({
        shortlist: [],
        blast: null,
        rationale: 'Nobody buys in Memphis at this price.',
      }),
    );
    // Sarah has not replied before, so no rule puts her on the list.
    const quiet = { ...sarah, history: { sent: 3, replies: 0, lastReplyAt: null } };
    const res = await agent().run(ctx({ buyers: [quiet, lisa, open, noEmail] }), 'acct', 'run-1');
    expect(res.decision.recommendation).toBe('hold');
    expect(res.decision.actions.map((a) => a.type)).toEqual([
      'rank_buyers',
      'append_note',
    ]);
    expect(res.decision.summary).toBe('hold: no buyer fits (2 considered)');
  });

  it('puts a buyer who buys here, at this price, and replied before at the top, even when the model left them out', async () => {
    chat.mockResolvedValue(
      reply({
        shortlist: [{ buyer_id: 'b-open', fit: 'possible', reason: 'Buys anywhere.' }],
      }),
    );
    const res = await agent().run(ctx(), 'acct', 'run-1');
    const rank = res.decision.actions.find((a) => a.type === 'rank_buyers');
    expect(rank && rank.type === 'rank_buyers' && rank.shortlist.map((b) => [b.rank, b.buyerId, b.fit])).toEqual([
      [1, 'b-sarah', 'strong'],
      [2, 'b-open', 'possible'],
    ]);
    expect(rank && rank.type === 'rank_buyers' && rank.shortlist[0].reason).toMatch(/added by Halo's rules/);
    const blast = res.decision.actions.find((a) => a.type === 'queue_buyer_blast');
    expect(blast && blast.type === 'queue_buyer_blast' && blast.buyerIds).toEqual(['b-sarah', 'b-open']);
  });

  it('honours the tenant mid-tier override', async () => {
    chat.mockResolvedValue(reply());
    await agent({ mid: 'claude-sonnet-5-5' }).run(ctx(), 'acct', 'run-1');
    expect(chat.mock.calls[0][1].model).toBe('claude-sonnet-5-5');
  });

  it('throws AgentOutputError on a non-JSON reply', async () => {
    chat.mockResolvedValue(completion('Top buyers: Sarah, then Lisa.'));
    await expect(agent().run(ctx(), 'acct', 'run-1')).rejects.toBeInstanceOf(
      AgentOutputError,
    );
  });
});
