import {
  AGENT_TIER,
  agentJobId,
  agentWorkflow,
  decisionNeedsApproval,
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
});
