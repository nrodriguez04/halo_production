import type { chatCompletion } from '../../internal-api.client';
import type { DealUnderwriterContext } from '../deal-context';
import { AgentOutputError } from '../lead-analyst.agent';
import {
  DealUnderwriterAgent,
  decisionFromHardRule,
  hardRule,
  hasValueData,
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

// 250,000 x 0.70 - 35,000 - the 12,500 fee = 127,500.
const offerReply = JSON.stringify({
  arv: 250000,
  repair_estimate: 35000,
  mao: 127500,
  offer_low: 110000,
  offer_high: 125000,
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
    // A rural parcel with no street address is identified by APN and county.
    expect(
      hardRule(
        ctx({
          property: { ...ctx().property!, address: null, zip: null, apn: 'R123', county: 'Bastrop' },
        }),
      ),
    ).toBeNull();
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

  it('restates the deterministic land strategy and never asks the model for an ARV', async () => {
    const analysis = {
      assetClass: 'land',
      subtype: 'rural_acreage',
      strategy: 'land_comparables',
      valuation: { low: 120000, mid: 135000, high: 150000 },
      approaches: [],
      evidence: [],
      confidence: { score: 0.55, level: 'medium' },
      missing: ['Legal access is not established: confirm road frontage or a recorded easement through title work.'],
      risks: ['Without legal access the parcel may be unsellable to most buyers.'],
      assumptions: ['A land buyer pays about 75% of the low end of the value range.'],
      offerRange: { low: 64000, high: 80000 },
      targetFee: 10000,
      expectedBuyerPrice: 90000,
      expectedNet: 0,
      buyerDemand: { level: 'unknown', matchingBuyers: 0, detail: 'Buyers have not been matched to this deal yet.' },
      decision: 'review',
      summary: 'Worth about $120,000-$150,000; offer $64,000-$80,000. Review first: Legal access is not established.',
      explanation: ['Halo valued the 12 acres from 5 comparable vacant-land sale(s).'],
      sensitivity: null,
    };
    const load = jest.fn().mockResolvedValue(analysis);
    const land = ctx({
      property: { ...ctx().property!, assetClass: 'land', estimatedValue: null, salePrice: null },
    });
    const res = await new DealUnderwriterAgent({
      chat: chat as unknown as typeof chatCompletion,
      assetUnderwriting: load,
    }).run(land, 'acct', 'run-1');
    expect(chat).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledWith('acct', land.deal.id);
    expect(res.costUsd).toBe(0);
    expect(res.decision.hardRule).toBe('asset_strategy');
    expect(res.decision.recommendation).toBe('hold');
    expect(res.decision.actions.map((a) => a.type)).toEqual(['append_note']);
    expect(res.decision.rationale).toMatch(/Strategy: land: comparable land sales per acre/);
    expect(res.decision.rationale).toMatch(/Missing: Legal access is not established/);
  });

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
      'offer $110,000-$125,000: ARV $250,000, repairs $35,000, MAO $127,500, confidence 0.72',
    );
    expect(res.decision.actions).toEqual([
      {
        type: 'set_deal_economics',
        arv: 250000,
        repairEstimate: 35000,
        mao: 127500,
        confidence: 0.72,
        offerLow: 110000,
        offerHigh: 125000,
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

  it("records the formula's MAO, not the model's arithmetic, and keeps the offers under it", async () => {
    chat.mockResolvedValue(
      completion(JSON.stringify({ ...JSON.parse(offerReply), mao: 151000, offer_high: 150000 })),
    );
    const res = await agent().run(ctx(), 'acct', 'run-1');
    expect(res.decision.actions[0]).toMatchObject({ mao: 127500, offerHigh: 127500, offerLow: 110000 });
    expect(res.decision.rationale).toContain('MAO $151,000 recomputed as $127,500');
    expect(res.decision.rationale).toContain('offer range capped at the MAO');
  });

  it('applies the prompt rules in code: no positive MAO is a pass, low confidence a hold', async () => {
    chat.mockResolvedValue(
      completion(JSON.stringify({ ...JSON.parse(offerReply), arv: 60000, repair_estimate: 40000 })),
    );
    expect((await agent().run(ctx(), 'acct', 'run-1')).decision.recommendation).toBe('pass');
    chat.mockResolvedValue(completion(JSON.stringify({ ...JSON.parse(offerReply), confidence: 0.3 })));
    expect((await agent().run(ctx(), 'acct', 'run-1')).decision.recommendation).toBe('hold');
  });

  it('holds by rule, without a model call, when nothing says what the property is worth', async () => {
    const bare = ctx({
      property: { ...ctx().property!, estimatedValue: null, salePrice: null },
      sources: [{ provider: 'attom', endpoint: 'x', summary: { propertyType: 'SFR', yearBuilt: 1975 } }],
    });
    expect(hasValueData(bare)).toBe(false);
    const res = await agent().run(bare, 'acct', 'run-1');
    expect(chat).not.toHaveBeenCalled();
    expect(res.decision).toMatchObject({ hardRule: 'no_value_data', recommendation: 'hold' });
    // A listing price, or numbers a person entered, are enough to value from.
    expect(hasValueData({ ...bare, sources: [{ provider: 'mls', endpoint: 'x', summary: { listPrice: 189000 } }] })).toBe(true);
    expect(hasValueData({ ...bare, deal: { ...bare.deal, arv: 200000 } })).toBe(true);
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
