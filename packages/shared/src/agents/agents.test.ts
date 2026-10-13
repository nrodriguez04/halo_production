import {
  AGENT_TIER,
  agentJobId,
  agentWorkflow,
  decisionNeedsApproval,
  classifyInboundByRule,
  parseDealUnderwriterOutput,
  parseDispositionMatcherOutput,
  parseOutreachDrafterOutput,
  parseLeadAnalystOutput,
  resolveAgentModel,
} from './agents';

describe('agent frame', () => {
  it('resolves models per tier with tenant overrides winning over the platform default', () => {
    expect(resolveAgentModel('mid')).toBe('gpt-4o');
    expect(resolveAgentModel('cheap', null)).toBe('gpt-4o-mini');
    expect(resolveAgentModel('strong', { strong: ' claude-opus-5-5 ' })).toBe('claude-opus-5-5');
    expect(resolveAgentModel('strong', { strong: '' })).toBe('gpt-4o');
    expect(AGENT_TIER.deal_underwriter).toBe('strong');
  });

  it('names budget workflows and idempotent job ids', () => {
    expect(agentWorkflow('lead_analyst')).toBe('agent:lead_analyst');
    expect(
      agentJobId({
        agent: 'lead_analyst',
        accountId: 't',
        entityType: 'lead',
        entityId: 'lead-1',
        trigger: 'sweep',
        triggerEventId: 'sweep:2026-10-12',
      }),
    ).toBe('lead_analyst__lead__lead-1__sweep-2026-10-12');
    expect(
      agentJobId({
        agent: 'lead_analyst',
        accountId: 't',
        entityType: 'lead',
        entityId: 'lead-1',
        trigger: 'manual',
      }),
    ).toBe('lead_analyst__lead__lead-1__manual');
  });

  it('needs approval only when an action is gated', () => {
    const base = {
      agent: 'lead_analyst' as const,
      promptVersion: 'v1',
      model: 'gpt-4o',
      recommendation: 'hold',
      summary: '',
      rationale: '',
    };
    expect(
      decisionNeedsApproval({ ...base, actions: [{ type: 'set_lead_score', score: 40 }] }),
    ).toBe(false);
    expect(
      decisionNeedsApproval({
        ...base,
        actions: [
          { type: 'transition_lead', to: 'qualified', reason: 'r', gated: true },
        ],
      }),
    ).toBe(true);
  });

  it('parses the Lead Analyst JSON out of a chatty reply and rejects malformed ones', () => {
    const reply = `Here you go:\n{"score": 78, "recommendation": "qualified", "rationale": "Absentee owner, tax delinquent.", "signals": ["absentee", "tax delinquent"], "first_touch_sms": "Hi, about 123 Main St...", "first_touch_email": {"subject": "123 Main St", "body": "Hello..."}}\nThanks!`;
    const out = parseLeadAnalystOutput(reply);
    expect(out).toMatchObject({
      score: 78,
      recommendation: 'qualified',
      signals: ['absentee', 'tax delinquent'],
      first_touch_email: { subject: '123 Main St' },
    });

    expect(parseLeadAnalystOutput('no json here')).toBeNull();
    expect(parseLeadAnalystOutput('{"score": 150, "recommendation": "qualified", "rationale": "x"}')).toBeNull();
    expect(parseLeadAnalystOutput('{"score": 10, "recommendation": "maybe", "rationale": "x"}')).toBeNull();
    expect(parseLeadAnalystOutput('{"score": 10, "recommendation": "hold", "rationale": "x"}')).toMatchObject({
      recommendation: 'hold',
      signals: [],
    });
  });

  it('parses the Deal Underwriter JSON, defaulting missing numbers to null', () => {
    const out = parseDealUnderwriterOutput(
      '```json\n{"arv": 250000, "repair_estimate": 35000, "mao": 130000, "confidence": 0.7, "recommendation": "offer", "rationale": "Solid spread."}\n```',
    );
    expect(out).toEqual({
      arv: 250000,
      repair_estimate: 35000,
      mao: 130000,
      offer_low: null,
      offer_high: null,
      confidence: 0.7,
      recommendation: 'offer',
      rationale: 'Solid spread.',
      comps_summary: null,
    });
    expect(
      parseDealUnderwriterOutput('{"confidence": 0.5, "recommendation": "buy", "rationale": "x"}'),
    ).toBeNull();
    expect(
      parseDealUnderwriterOutput('{"confidence": 1.5, "recommendation": "offer", "rationale": "x"}'),
    ).toBeNull();
  });

  it('classifies opt-outs and wrong numbers by rule, and leaves the rest to the model', () => {
    expect(classifyInboundByRule('Please stop texting me')).toMatchObject({ intent: 'opt_out' });
    expect(classifyInboundByRule("I'm not interested, don't contact me again")).toMatchObject({
      intent: 'opt_out',
    });
    expect(classifyInboundByRule('Take me off your list')).toMatchObject({ intent: 'opt_out' });
    // How buyers say it about deal emails.
    expect(classifyInboundByRule('Stop sending me deals, I am out of the market')).toMatchObject({
      intent: 'opt_out',
    });
    expect(classifyInboundByRule('No more deals please')).toMatchObject({ intent: 'opt_out' });
    expect(classifyInboundByRule('Can you send me more deals like this one?')).toBeNull();
    expect(classifyInboundByRule('You have the wrong number')).toMatchObject({
      intent: 'wrong_number',
    });
    expect(classifyInboundByRule("Sorry, I don't know who this is")).toMatchObject({
      intent: 'wrong_number',
    });
    expect(classifyInboundByRule("I can't stop by today, maybe Friday?")).toBeNull();
    expect(classifyInboundByRule('How much are you offering?')).toBeNull();
    expect(classifyInboundByRule('')).toBeNull();
  });

  it('parses the Outreach Drafter JSON and rejects unknown intents', () => {
    const out = parseOutreachDrafterOutput(
      '{"intent": "interested", "confidence": 0.9, "reply": {"body": "Thanks, when works for a call?"}, "rationale": "Asked about the offer."}',
    );
    expect(out).toEqual({
      intent: 'interested',
      confidence: 0.9,
      reply: { body: 'Thanks, when works for a call?', subject: null },
      rationale: 'Asked about the offer.',
      next_step: null,
    });
    expect(
      parseOutreachDrafterOutput('{"intent": "angry", "confidence": 0.9, "rationale": "x"}'),
    ).toBeNull();
    expect(
      parseOutreachDrafterOutput('{"intent": "opt_out", "confidence": 1, "reply": null, "rationale": "x"}'),
    ).toMatchObject({ intent: 'opt_out', reply: null });
  });

  it('parses the Disposition Matcher JSON with an empty shortlist and null blast by default', () => {
    expect(
      parseDispositionMatcherOutput(
        '{"shortlist": [{"buyer_id": "b1", "fit": "strong", "reason": "Memphis SFH buyer, replied twice"}], "blast": {"subject": "Memphis SFH under contract", "body": "..."}, "rationale": "r"}',
      ),
    ).toMatchObject({ shortlist: [{ buyer_id: 'b1', fit: 'strong' }], blast: { subject: 'Memphis SFH under contract' } });
    expect(parseDispositionMatcherOutput('{"rationale": "nobody fits"}')).toEqual({
      shortlist: [],
      blast: null,
      rationale: 'nobody fits',
    });
    expect(
      parseDispositionMatcherOutput('{"shortlist": [{"buyer_id": "b1", "fit": "great", "reason": "x"}], "rationale": "r"}'),
    ).toBeNull();
  });
});
