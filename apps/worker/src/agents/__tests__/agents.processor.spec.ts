import type { AgentDecision, AgentJobPayload } from '@halo/shared';

const mockPrisma = { automationRun: { findFirst: jest.fn() } };
jest.mock('../../prisma-client', () => ({ prisma: mockPrisma }));

const mockGetControlPlane = jest.fn();
jest.mock('../../control-plane', () => ({
  getControlPlane: (...args: unknown[]) => mockGetControlPlane(...args),
}));

const mockOpenAgentRun = jest.fn();
const mockRecordAgentDecision = jest.fn();
jest.mock('../../internal-api.client', () => {
  const actual = jest.requireActual('../../internal-api.client');
  return {
    ...actual,
    openAgentRun: (...args: unknown[]) => mockOpenAgentRun(...args),
    recordAgentDecision: (...args: unknown[]) => mockRecordAgentDecision(...args),
  };
});

const mockLoadLeadContext = jest.fn();
jest.mock('../agent-context', () => ({
  loadLeadContext: (...args: unknown[]) => mockLoadLeadContext(...args),
}));

const mockAgentRun = jest.fn();
jest.mock('../lead-analyst.agent', () => {
  const actual = jest.requireActual('../lead-analyst.agent');
  return {
    ...actual,
    LeadAnalystAgent: jest.fn().mockImplementation(() => ({ run: mockAgentRun })),
  };
});

const mockLoadDealContext = jest.fn();
jest.mock('../deal-context', () => ({
  loadDealContext: (...args: unknown[]) => mockLoadDealContext(...args),
}));
const mockUnderwriterRun = jest.fn();
jest.mock('../deal-underwriter.agent', () => ({
  DealUnderwriterAgent: jest.fn().mockImplementation(() => ({ run: mockUnderwriterRun })),
}));

const mockLoadOutreachContext = jest.fn();
jest.mock('../outreach-context', () => ({
  loadOutreachContext: (...args: unknown[]) => mockLoadOutreachContext(...args),
}));
const mockDrafterRun = jest.fn();
jest.mock('../outreach-drafter.agent', () => ({
  OutreachDrafterAgent: jest.fn().mockImplementation(() => ({ run: mockDrafterRun })),
}));

const mockLoadDispositionContext = jest.fn();
jest.mock('../disposition-context', () => ({
  loadDispositionContext: (...args: unknown[]) => mockLoadDispositionContext(...args),
}));
const mockMatcherRun = jest.fn();
jest.mock('../disposition-matcher.agent', () => ({
  DispositionMatcherAgent: jest.fn().mockImplementation(() => ({ run: mockMatcherRun })),
}));

import {
  CostBlockedError,
  IntegrationUnavailableError,
  InternalApiError,
} from '../../internal-api.client';
import { AgentOutputError, LeadAnalystAgent } from '../lead-analyst.agent';
import { DealUnderwriterAgent } from '../deal-underwriter.agent';
import { AgentsProcessor } from '../agents.processor';

const job = (data: Partial<AgentJobPayload> = {}) =>
  ({
    data: {
      agent: 'lead_analyst',
      accountId: 'acct',
      entityType: 'lead',
      entityId: 'lead-1',
      trigger: 'lifecycle',
      triggerEventId: 'enriched:job-1',
      ...data,
    },
  }) as any;

const decision = (actions: AgentDecision['actions']): AgentDecision => ({
  agent: 'lead_analyst',
  promptVersion: 'lead_analyst.v1',
  model: 'gpt-4o',
  recommendation: 'hold',
  summary: 's',
  rationale: 'r',
  hardRule: null,
  actions,
});
const ungated = decision([
  { type: 'set_lead_score', score: 40 },
  { type: 'append_note', note: 'n' },
]);
const gated = decision([
  { type: 'set_lead_score', score: 80 },
  { type: 'transition_lead', to: 'qualified', reason: 'r', gated: true },
]);

describe('AgentsProcessor', () => {
  const processor = new AgentsProcessor();

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetControlPlane.mockResolvedValue({
      enabled: true,
      aiEnabled: true,
      agentAutonomy: 'draft_only',
      agentModels: { mid: 'gpt-4o' },
    });
    mockPrisma.automationRun.findFirst.mockResolvedValue(null);
    mockOpenAgentRun.mockResolvedValue({ id: 'run-1' });
    mockRecordAgentDecision.mockResolvedValue({});
    mockLoadLeadContext.mockResolvedValue({ lead: { id: 'lead-1' } });
    mockAgentRun.mockResolvedValue({ decision: ungated, costUsd: 0.01 });
  });

  it('does nothing when AI is off for the tenant', async () => {
    mockGetControlPlane.mockResolvedValue({ enabled: true, aiEnabled: false });
    await expect(processor.process(job())).resolves.toEqual({
      skipped: 'ai disabled for tenant',
    });
    expect(mockOpenAgentRun).not.toHaveBeenCalled();
  });

  it('skips agents that are not released yet', async () => {
    await expect(processor.process(job({ agent: 'closing_coordinator' as any }))).resolves.toEqual({
      skipped: 'agent closing_coordinator is not released yet',
    });
    expect(mockOpenAgentRun).not.toHaveBeenCalled();
  });

  it('does not open a second run while one is open for the same entity', async () => {
    mockPrisma.automationRun.findFirst.mockResolvedValue({ id: 'run-0' });
    await expect(processor.process(job())).resolves.toEqual({
      skipped: 'run run-0 already open',
    });
    expect(mockPrisma.automationRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'acct',
          agentName: 'lead_analyst',
          entityId: 'lead-1',
          status: { in: ['QUEUED', 'RUNNING', 'AWAITING_APPROVAL'] },
        }),
      }),
    );
    expect(mockOpenAgentRun).not.toHaveBeenCalled();
  });

  it('lets a manual run through even when another run is open', async () => {
    mockPrisma.automationRun.findFirst.mockResolvedValue({ id: 'run-0' });
    await processor.process(job({ trigger: 'manual', triggerEventId: 'manual:1' }));
    expect(mockPrisma.automationRun.findFirst).not.toHaveBeenCalled();
    expect(mockOpenAgentRun).toHaveBeenCalled();
  });

  it('opens the run first, runs the agent with tenant models, and records a completed decision', async () => {
    const result = await processor.process(job());

    expect(mockOpenAgentRun).toHaveBeenCalledWith('acct', {
      agent: 'lead_analyst',
      entityType: 'lead',
      entityId: 'lead-1',
      trigger: 'lifecycle',
      triggerEventId: 'enriched:job-1',
      actorId: null,
    });
    expect(mockLoadLeadContext).toHaveBeenCalledWith('lead-1', 'acct');
    expect(LeadAnalystAgent).toHaveBeenCalledWith({ models: { mid: 'gpt-4o' } });
    expect(mockAgentRun).toHaveBeenCalledWith({ lead: { id: 'lead-1' } }, 'acct', 'run-1');
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'COMPLETED',
      decision: ungated,
      costUsd: 0.01,
    });
    expect(result).toEqual({ runId: 'run-1', status: 'COMPLETED', recommendation: 'hold' });
  });

  it('reports AWAITING_APPROVAL when any action is gated', async () => {
    mockAgentRun.mockResolvedValue({ decision: gated, costUsd: 0.02 });
    const result = await processor.process(job());
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'AWAITING_APPROVAL',
      decision: gated,
      costUsd: 0.02,
    });
    expect(result.status).toBe('AWAITING_APPROVAL');
  });

  it('fails the run when the lead is gone', async () => {
    mockLoadLeadContext.mockResolvedValue(null);
    await expect(processor.process(job())).resolves.toEqual({ runId: 'run-1', status: 'FAILED' });
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'FAILED',
      error: 'Lead lead-1 not found',
    });
    expect(mockAgentRun).not.toHaveBeenCalled();
  });

  it('records a budget block as cancelled with a blocked decision, not as a failure', async () => {
    mockAgentRun.mockRejectedValue(
      new CostBlockedError('HARD_CAP', 'openai', 'monthly cap for agent:lead_analyst reached'),
    );
    const result = await processor.process(job());
    expect(result).toEqual({ runId: 'run-1', status: 'CANCELLED', skipped: 'HARD_CAP' });
    expect(mockRecordAgentDecision).toHaveBeenCalledWith(
      'acct',
      'run-1',
      expect.objectContaining({
        status: 'CANCELLED',
        decision: expect.objectContaining({
          agent: 'lead_analyst',
          recommendation: 'blocked',
          model: null,
          actions: [],
          summary: 'blocked by cost control: HARD_CAP',
        }),
      }),
    );
  });

  it('rethrows an api outage so BullMQ retries, without closing the run', async () => {
    mockAgentRun.mockRejectedValue(new InternalApiError(503, 'api down'));
    await expect(processor.process(job())).rejects.toBeInstanceOf(InternalApiError);
    expect(mockRecordAgentDecision).not.toHaveBeenCalled();
  });

  it('fails the run with the raw reply when the model did not answer in JSON', async () => {
    mockAgentRun.mockRejectedValue(new AgentOutputError('not JSON', 'Sorry, no.'));
    await expect(processor.process(job())).resolves.toEqual({ runId: 'run-1', status: 'FAILED' });
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'FAILED',
      error: 'not JSON: Sorry, no.',
    });
  });

  it('fails the run with the provider reason when the provider is unavailable', async () => {
    mockAgentRun.mockRejectedValue(
      new IntegrationUnavailableError('openai', 'REJECTED_CREDENTIALS', 'bad key'),
    );
    await processor.process(job());
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'FAILED',
      error: 'openai unavailable (REJECTED_CREDENTIALS): bad key',
    });
  });

  it('dispatches deal runs to the Deal Underwriter with the tenant models', async () => {
    const numbers = decision([
      {
        type: 'set_deal_economics',
        arv: 250000,
        repairEstimate: 30000,
        mao: 135000,
        confidence: 0.7,
        offerLow: 115000,
        offerHigh: 135000,
        rationale: 'r',
        compsSummary: null,
        dealUpdatedAt: '2026-10-12T00:00:00.000Z',
      },
    ]);
    mockLoadDealContext.mockResolvedValue({ deal: { id: 'deal-1' } });
    mockUnderwriterRun.mockResolvedValue({ decision: numbers, costUsd: 0.05 });

    const result = await processor.process(
      job({ agent: 'deal_underwriter', entityType: 'deal', entityId: 'deal-1' }),
    );

    expect(mockLoadDealContext).toHaveBeenCalledWith('deal-1', 'acct');
    expect(mockLoadLeadContext).not.toHaveBeenCalled();
    expect(DealUnderwriterAgent).toHaveBeenCalledWith({ models: { mid: 'gpt-4o' } });
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'COMPLETED',
      decision: numbers,
      costUsd: 0.05,
    });
    expect(result.status).toBe('COMPLETED');
  });

  it('fails a deal run when the deal is gone', async () => {
    mockLoadDealContext.mockResolvedValue(null);
    await processor.process(
      job({ agent: 'deal_underwriter', entityType: 'deal', entityId: 'deal-9' }),
    );
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'FAILED',
      error: 'Deal deal-9 not found',
    });
  });

  it('dispatches inbound runs to the Outreach Drafter and never de-dupes a reply', async () => {
    mockPrisma.automationRun.findFirst.mockResolvedValue({ id: 'run-0' });
    const draft = decision([
      { type: 'append_note', note: 'n' },
      {
        type: 'draft_message',
        channel: 'sms',
        recipientType: 'seller',
        content: 'Thanks, when works?',
        inReplyToMessageId: 'msg-1',
        gated: true,
      },
    ]);
    mockLoadOutreachContext.mockResolvedValue({ inbound: { id: 'msg-1' } });
    mockDrafterRun.mockResolvedValue({ decision: draft, costUsd: 0.004 });

    const result = await processor.process(
      job({
        agent: 'outreach_drafter',
        entityType: 'deal',
        entityId: 'deal-1',
        trigger: 'inbound',
        triggerEventId: 'inbound:msg-1',
        messageId: 'msg-1',
      }),
    );

    expect(mockPrisma.automationRun.findFirst).not.toHaveBeenCalled();
    expect(mockLoadOutreachContext).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'deal', entityId: 'deal-1', messageId: 'msg-1' }),
    );
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'AWAITING_APPROVAL',
      decision: draft,
      costUsd: 0.004,
    });
    expect(result.status).toBe('AWAITING_APPROVAL');
  });

  it('dispatches under-contract deals to the Disposition Matcher', async () => {
    const ranking = decision([
      { type: 'rank_buyers', shortlist: [], consideredCount: 0 },
      { type: 'append_note', note: 'n' },
    ]);
    mockLoadDispositionContext.mockResolvedValue({ deal: { id: 'deal-1' } });
    mockMatcherRun.mockResolvedValue({ decision: ranking, costUsd: 0 });

    const result = await processor.process(
      job({ agent: 'disposition_matcher', entityType: 'deal', entityId: 'deal-1' }),
    );

    expect(mockLoadDispositionContext).toHaveBeenCalledWith('deal-1', 'acct');
    expect(mockRecordAgentDecision).toHaveBeenCalledWith('acct', 'run-1', {
      status: 'COMPLETED',
      decision: ranking,
      costUsd: 0,
    });
    expect(result.status).toBe('COMPLETED');
  });
});
