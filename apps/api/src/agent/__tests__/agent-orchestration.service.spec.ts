import { BadRequestException } from '@nestjs/common';
import { AGENT_NAMES, type AgentDecision } from '@halo/shared';
import { AgentOrchestrationService } from '../agent-orchestration.service';

const prisma = {
  automationRun: {
    findFirst: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
  },
  lead: { updateMany: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  deal: { findFirst: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
  underwritingResult: { upsert: jest.fn() },
  message: { findFirst: jest.fn(), update: jest.fn() },
  marketingMaterial: { create: jest.fn() },
  buyer: { findMany: jest.fn() },
};
const communications = { create: jest.fn() };
jest.mock('../../pii/contact-crypto', () => ({
  openValue: jest.fn((enc: string) => `open:${enc}`),
}));
const optOut = { recordPhoneOptOut: jest.fn(), recordEmailOptOut: jest.fn() };
jest.mock('../../communications/message-counterparty', () => ({
  openCounterparty: jest.fn(() => '+15551234567'),
}));
const automation = {
  createRun: jest.fn(),
  startRun: jest.fn(),
  failRun: jest.fn(),
  completeRun: jest.fn(),
  approveRun: jest.fn(),
  getRun: jest.fn(),
};
const controlPlane = { isEnabled: jest.fn(), getStatus: jest.fn() };
const deals = { create: jest.fn(), updateStage: jest.fn() };
const lifecycle = { transition: jest.fn() };
const queues = { enqueueAgent: jest.fn() };
const timeline = { appendEvent: jest.fn() };
const agentService = { draftMessage: jest.fn() };
const disclosure = { assertEquitableInterest: jest.fn() };
const skipTrace = { traceLead: jest.fn() };

const service = () =>
  new AgentOrchestrationService(
    prisma as any,
    automation as any,
    controlPlane as any,
    deals as any,
    lifecycle as any,
    queues as any,
    timeline as any,
    agentService as any,
    optOut as any,
    communications as any,
    disclosure as any,
    skipTrace as any,
  );

const baseRun = {
  id: 'run-1',
  tenantId: 'acct',
  status: 'RUNNING',
  entityType: 'lead',
  entityId: 'lead-1',
  decisionJson: null as unknown,
};

const ruleDisqualify: AgentDecision = {
  agent: 'lead_analyst',
  promptVersion: 'lead_analyst.v1',
  model: null,
  recommendation: 'disqualified',
  summary: 'disqualified by rule dnc',
  rationale: 'Contact is on the do-not-call list',
  confidence: 1,
  hardRule: 'dnc',
  actions: [
    { type: 'set_lead_score', score: 5 },
    { type: 'append_note', note: 'DNC (rule: dnc)' },
    {
      type: 'transition_lead',
      to: 'disqualified',
      reason: 'Contact is on the do-not-call list',
      gated: false,
    },
  ],
};

const qualified: AgentDecision = {
  agent: 'lead_analyst',
  promptVersion: 'lead_analyst.v1',
  model: 'gpt-4o',
  recommendation: 'qualified',
  summary: 'qualified (82/100): absentee, equity',
  rationale: 'Absentee owner with equity.',
  hardRule: null,
  actions: [
    { type: 'set_lead_score', score: 82 },
    { type: 'append_note', note: 'Absentee owner with equity.' },
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
      content: 'Hi about 123 Main St',
      gated: true,
    },
    {
      type: 'draft_message',
      channel: 'email',
      recipientType: 'seller',
      content: 'Hello about 123 Main St',
      subject: '123 Main St',
      gated: true,
    },
  ],
};

describe('AgentOrchestrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    controlPlane.isEnabled.mockResolvedValue(true);
    controlPlane.getStatus.mockResolvedValue({ agentAutonomy: 'draft_only' });
    prisma.automationRun.findFirst.mockResolvedValue({ ...baseRun });
    prisma.automationRun.update.mockResolvedValue({});
    prisma.lead.updateMany.mockResolvedValue({ count: 1 });
    timeline.appendEvent.mockResolvedValue({});
    lifecycle.transition.mockResolvedValue({});
    automation.createRun.mockResolvedValue({ id: 'run-1' });
    automation.startRun.mockResolvedValue({});
    automation.getRun.mockResolvedValue({ id: 'run-1', status: 'x' });
    automation.completeRun.mockResolvedValue({
      id: 'run-1',
      status: 'COMPLETED',
    });
    automation.failRun.mockResolvedValue({ id: 'run-1', status: 'FAILED' });
    automation.approveRun.mockResolvedValue({});
    queues.enqueueAgent.mockResolvedValue({});
    prisma.deal.findMany.mockResolvedValue([]);
    prisma.message.findFirst.mockResolvedValue(null);
    prisma.message.update.mockResolvedValue({});
    deals.updateStage.mockResolvedValue({});
    prisma.marketingMaterial.create.mockResolvedValue({});
    disclosure.assertEquitableInterest.mockResolvedValue({
      required: false,
      satisfied: true,
      state: null,
    });
    skipTrace.traceLead.mockResolvedValue({
      status: 'matched',
      phones: [{}],
      emails: [],
    });
    optOut.recordPhoneOptOut.mockResolvedValue({
      accountIds: ['acct'],
      consentsRevoked: 1,
    });
  });

  describe('enqueue', () => {
    const payload = {
      agent: 'lead_analyst' as const,
      accountId: 'acct',
      entityType: 'lead' as const,
      entityId: 'lead-1',
      trigger: 'manual' as const,
    };

    it('queues when the control plane is on', async () => {
      await expect(service().enqueue(payload)).resolves.toBe(true);
      expect(queues.enqueueAgent).toHaveBeenCalledWith(payload);
    });

    it('queues nothing when the control plane is off', async () => {
      controlPlane.isEnabled.mockResolvedValue(false);
      await expect(service().enqueue(payload)).resolves.toBe(false);
      expect(queues.enqueueAgent).not.toHaveBeenCalled();
    });
  });

  describe('openRun', () => {
    it('opens and starts a ledger row attributed to the agent workflow', async () => {
      const res = await service().openRun('acct', {
        agent: 'lead_analyst',
        entityType: 'lead',
        entityId: 'lead-1',
        trigger: 'sweep',
        triggerEventId: 'sweep:2026-10-12',
      });
      expect(res).toEqual({ id: 'run-1' });
      expect(automation.createRun).toHaveBeenCalledWith({
        tenantId: 'acct',
        source: 'agent',
        agentName: 'lead_analyst',
        workflowName: 'agent:lead_analyst',
        entityType: 'lead',
        entityId: 'lead-1',
        triggerType: 'SCHEDULED',
        inputJson: {
          trigger: 'sweep',
          triggerEventId: 'sweep:2026-10-12',
          actorId: null,
        },
        approvalRequired: false,
      });
      expect(automation.startRun).toHaveBeenCalledWith('run-1', 'acct');
    });
  });

  describe('recordDecision', () => {
    it('fails the run with the worker error', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'FAILED',
        error: 'openai unavailable',
      });
      expect(automation.failRun).toHaveBeenCalledWith('run-1', 'acct', {
        error: 'openai unavailable',
        decision: null,
      });
    });

    it('rejects a run the tenant does not own', async () => {
      prisma.automationRun.findFirst.mockResolvedValue(null);
      await expect(
        service().recordDecision('acct', 'run-9', { status: 'COMPLETED' }),
      ).rejects.toThrow('Automation run run-9 not found');
    });

    it('under draft_only applies score and note but holds even a rule disqualify for a person', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: ruleDisqualify,
        costUsd: 0,
      });

      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', accountId: 'acct' },
        data: { score: 5 },
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'acct',
          entityId: 'lead-1',
          eventType: 'AGENT_NOTE',
          payload: expect.objectContaining({
            note: 'DNC (rule: dnc)',
            agent: 'lead_analyst',
            automationRunId: 'run-1',
            hardRule: 'dnc',
          }),
        }),
      );
      expect(lifecycle.transition).not.toHaveBeenCalled();
      expect(automation.completeRun).not.toHaveBeenCalled();

      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'AWAITING_APPROVAL',
        approvalRequired: true,
        modelProvider: null,
        modelName: null,
        promptVersion: 'lead_analyst.v1',
        aiCostUsd: 0,
        outputJson: { recommendation: 'disqualified', pendingActions: 1 },
      });
      expect(data.decisionJson.autonomy).toBe('draft_only');
      expect(data.decisionJson.outcomes.map((o: any) => o.result)).toEqual([
        'applied',
        'applied',
        'pending',
      ]);
    });

    it('under standard applies an ungated transition as the system and completes the run', async () => {
      controlPlane.getStatus.mockResolvedValue({ agentAutonomy: 'standard' });

      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: ruleDisqualify,
      });

      expect(lifecycle.transition).toHaveBeenCalledWith({
        leadId: 'lead-1',
        accountId: 'acct',
        next: 'disqualified',
        actorType: 'system',
        reason: 'Contact is on the do-not-call list',
        metadata: { agent: 'lead_analyst', automationRunId: 'run-1' },
      });
      expect(automation.completeRun).toHaveBeenCalledWith('run-1', 'acct', {
        outputJson: {
          recommendation: 'disqualified',
          summary: 'disqualified by rule dnc',
          applied: 3,
        },
        aiCostUsd: 0,
      });
    });

    it('never applies gated actions on its own, whatever the autonomy', async () => {
      controlPlane.getStatus.mockResolvedValue({ agentAutonomy: 'standard' });

      await service().recordDecision('acct', 'run-1', {
        status: 'AWAITING_APPROVAL',
        decision: qualified,
        costUsd: 0.03,
      });

      expect(lifecycle.transition).not.toHaveBeenCalled();
      expect(agentService.draftMessage).not.toHaveBeenCalled();
      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data).toMatchObject({
        status: 'AWAITING_APPROVAL',
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        aiCostUsd: 0.03,
        outputJson: { recommendation: 'qualified', pendingActions: 3 },
      });
    });

    it('records a budget block as cancelled with the blocked decision', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'CANCELLED',
        decision: { ...qualified, recommendation: 'blocked', actions: [] },
      });
      expect(prisma.automationRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'run-1' },
          data: expect.objectContaining({
            status: 'CANCELLED',
            decisionJson: expect.objectContaining({
              recommendation: 'blocked',
            }),
          }),
        }),
      );
      expect(automation.getRun).toHaveBeenCalledWith('run-1', 'acct');
    });
  });

  describe('approve', () => {
    const awaiting = () => ({
      ...baseRun,
      status: 'AWAITING_APPROVAL',
      decisionJson: {
        ...qualified,
        autonomy: 'draft_only',
        outcomes: [
          { action: qualified.actions[0], result: 'applied' },
          { action: qualified.actions[1], result: 'applied' },
          { action: qualified.actions[2], result: 'pending' },
          { action: qualified.actions[3], result: 'pending' },
          { action: qualified.actions[4], result: 'pending' },
        ],
      },
    });

    beforeEach(() => {
      prisma.automationRun.findFirst.mockResolvedValue(awaiting());
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        canonicalPhoneHash: 'ph',
        canonicalEmailHash: null,
        properties: [{ id: 'prop-1' }],
      });
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal-1' });
      agentService.draftMessage.mockResolvedValue({ message: { id: 'm1' } });
    });

    it('moves the lead as the approver, drafts only on channels with a contact, and completes', async () => {
      await service().approve('acct', 'run-1', 'user-1');

      expect(lifecycle.transition).toHaveBeenCalledWith({
        leadId: 'lead-1',
        accountId: 'acct',
        next: 'qualified',
        actorId: 'user-1',
        actorType: 'user',
        reason: 'Lead Analyst recommendation',
        metadata: {
          agent: 'lead_analyst',
          automationRunId: 'run-1',
          approvedBy: 'user-1',
        },
      });
      expect(agentService.draftMessage).toHaveBeenCalledTimes(1);
      expect(agentService.draftMessage).toHaveBeenCalledWith(
        'deal-1',
        'acct',
        'sms',
        'seller',
        {
          content: 'Hi about 123 Main St',
          subject: undefined,
          agentName: 'lead_analyst',
          workflowName: 'agent:lead_analyst',
          automationRunId: 'run-1',
        },
      );
      expect(deals.create).not.toHaveBeenCalled();
      expect(automation.approveRun).toHaveBeenCalledWith(
        'run-1',
        'acct',
        'user-1',
      );

      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.decisionJson.approval).toMatchObject({ by: 'user-1' });
      expect(data.decisionJson.outcomes.map((o: any) => o.result)).toEqual([
        'applied',
        'applied',
        'applied',
        'applied',
        'skipped',
      ]);
      expect(data.decisionJson.outcomes[4].detail).toBe(
        'lead has no email on file',
      );

      expect(automation.completeRun).toHaveBeenCalledWith('run-1', 'acct', {
        outputJson: {
          recommendation: 'qualified',
          summary: 'qualified (82/100): absentee, equity',
          applied: 4,
          messageIds: ['m1'],
        },
      });
    });

    it('opens a deal for the drafts when the lead has none', async () => {
      prisma.deal.findFirst.mockResolvedValue(null);
      deals.create.mockResolvedValue({ id: 'deal-2' });

      await service().approve('acct', 'run-1', 'user-1');

      expect(deals.create).toHaveBeenCalledWith(
        {
          accountId: 'acct',
          leadId: 'lead-1',
          propertyId: 'prop-1',
          stage: 'new',
        },
        'user-1',
      );
      expect(agentService.draftMessage.mock.calls[0][0]).toBe('deal-2');
    });

    it('records a failed draft without losing the approval', async () => {
      agentService.draftMessage.mockRejectedValue(new Error('sms disabled'));

      await service().approve('acct', 'run-1', 'user-1');

      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.decisionJson.outcomes[3]).toMatchObject({
        result: 'failed',
        detail: 'sms disabled',
      });
      expect(automation.completeRun).toHaveBeenCalled();
    });

    it('refuses a run that is not awaiting approval', async () => {
      prisma.automationRun.findFirst.mockResolvedValue({
        ...baseRun,
        status: 'COMPLETED',
      });
      await expect(
        service().approve('acct', 'run-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(lifecycle.transition).not.toHaveBeenCalled();
    });
  });

  describe('reject', () => {
    it('closes the run as cancelled with the reason and leaves the lead alone', async () => {
      prisma.automationRun.findFirst.mockResolvedValue({
        ...baseRun,
        status: 'AWAITING_APPROVAL',
        decisionJson: { ...qualified },
      });

      await service().reject('acct', 'run-1', 'user-1', 'wrong owner');

      expect(lifecycle.transition).not.toHaveBeenCalled();
      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.status).toBe('CANCELLED');
      expect(data.decisionJson.rejection).toMatchObject({
        by: 'user-1',
        reason: 'wrong owner',
      });
      expect(data.decisionJson.recommendation).toBe('qualified');
    });

    it('refuses a run that is not awaiting approval', async () => {
      await expect(
        service().reject('acct', 'run-1', 'user-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('listRuns', () => {
    it('lists agent runs with a lead label', async () => {
      prisma.automationRun.findMany.mockResolvedValue([
        { id: 'r1', entityType: 'lead', entityId: 'lead-1' },
        { id: 'r2', entityType: 'lead', entityId: 'lead-gone' },
      ]);
      prisma.lead.findMany.mockResolvedValue([
        {
          id: 'lead-1',
          canonicalAddress: '1 Main St',
          canonicalCity: 'Austin',
          canonicalState: 'TX',
          status: 'enriched',
          score: 50,
        },
      ]);

      const runs = await service().listRuns('acct', {});

      expect(prisma.automationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'acct',
            source: 'agent',
            agentName: { in: [...AGENT_NAMES] },
          },
          take: 50,
        }),
      );
      expect(runs[0].entity).toEqual({
        label: '1 Main St, Austin, TX',
        status: 'enriched',
        score: 50,
      });
      expect(runs[1].entity).toBeNull();
    });

    it('filters by agent and status and caps the page size', async () => {
      prisma.automationRun.findMany.mockResolvedValue([]);
      await service().listRuns('acct', {
        agent: 'lead_analyst',
        status: 'AWAITING_APPROVAL' as any,
        limit: 1000,
      });
      expect(prisma.automationRun.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: 'acct',
            source: 'agent',
            agentName: 'lead_analyst',
            status: 'AWAITING_APPROVAL',
          },
          take: 200,
        }),
      );
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
    });
  });

  describe('sweep', () => {
    it('re-queues leads stale in enriched with no deal, once per day, only for enabled tenants', async () => {
      prisma.lead.findMany.mockResolvedValue([
        { id: 'l1', accountId: 'a1' },
        { id: 'l2', accountId: 'a2' },
      ]);
      controlPlane.isEnabled.mockImplementation(
        async (id: string) => id === 'a1',
      );
      const now = new Date('2026-10-12T07:05:00.000Z');

      await expect(service().sweep(now, 7)).resolves.toBe(1);

      expect(prisma.lead.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'enriched',
            updatedAt: { lte: new Date('2026-10-05T07:05:00.000Z') },
            deals: { none: {} },
          },
        }),
      );
      expect(queues.enqueueAgent).toHaveBeenCalledTimes(1);
      expect(queues.enqueueAgent).toHaveBeenCalledWith({
        agent: 'lead_analyst',
        accountId: 'a1',
        entityType: 'lead',
        entityId: 'l1',
        trigger: 'sweep',
        triggerEventId: 'sweep:2026-10-12',
      });
    });
  });

  describe('set_deal_economics (Deal Underwriter)', () => {
    const numbers: AgentDecision = {
      agent: 'deal_underwriter',
      promptVersion: 'deal_underwriter.v1',
      model: 'gpt-4o',
      recommendation: 'offer',
      summary: 'offer $110,000-$130,000',
      rationale: 'Solid spread.',
      confidence: 0.72,
      hardRule: null,
      actions: [
        {
          type: 'set_deal_economics',
          arv: 250000,
          repairEstimate: 35000,
          mao: 130000,
          confidence: 0.72,
          offerLow: 110000,
          offerHigh: 130000,
          rationale: 'Solid spread.',
          compsSummary: 'Two sales nearby.',
          dealUpdatedAt: '2026-10-12T10:00:00.000Z',
        },
        { type: 'append_note', note: 'Solid spread.' },
      ],
    };

    beforeEach(() => {
      prisma.automationRun.findFirst.mockResolvedValue({
        ...baseRun,
        entityType: 'deal',
        entityId: 'deal-1',
      });
      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        propertyId: 'prop-1',
      });
      prisma.deal.updateMany.mockResolvedValue({ count: 1 });
      prisma.underwritingResult.upsert.mockResolvedValue({});
    });

    it('writes the numbers behind the stale guard, records the result, notes the deal, and completes', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: numbers,
        costUsd: 0.05,
      });

      expect(prisma.deal.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'deal-1',
          accountId: 'acct',
          updatedAt: new Date('2026-10-12T10:00:00.000Z'),
        },
        data: { arv: 250000, repairEstimate: 35000, mao: 130000 },
      });
      const upsert = prisma.underwritingResult.upsert.mock.calls[0][0];
      expect(upsert.where).toEqual({ dealId: 'deal-1' });
      expect(upsert.create).toMatchObject({
        dealId: 'deal-1',
        propertyId: 'prop-1',
        arv: 250000,
        confidence: 0.72,
        rationale: 'Solid spread.',
        compsSummary: { summary: 'Two sales nearby.' },
        evaluationMetadata: {
          agent: 'deal_underwriter',
          automationRunId: 'run-1',
          model: 'gpt-4o',
          recommendation: 'offer',
          offerRange: { low: 110000, high: 130000 },
          stale: false,
        },
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'DEAL',
          entityId: 'deal-1',
          eventType: 'AGENT_NOTE',
        }),
      );
      expect(prisma.lead.updateMany).not.toHaveBeenCalled();
      expect(automation.completeRun).toHaveBeenCalledWith('run-1', 'acct', {
        outputJson: {
          recommendation: 'offer',
          summary: 'offer $110,000-$130,000',
          applied: 2,
        },
        aiCostUsd: 0.05,
      });
    });

    it("keeps a person's edits when the deal changed during the run and flags the result stale", async () => {
      prisma.deal.updateMany.mockResolvedValue({ count: 0 });

      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: numbers,
      });

      const upsert = prisma.underwritingResult.upsert.mock.calls[0][0];
      expect(upsert.update.evaluationMetadata.stale).toBe(true);
      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.decisionJson.outcomes[0]).toMatchObject({
        result: 'skipped',
        detail: expect.stringContaining('edited during the run'),
      });
      expect(automation.completeRun).toHaveBeenCalledWith(
        'run-1',
        'acct',
        expect.objectContaining({
          outputJson: expect.objectContaining({ applied: 1 }),
        }),
      );
    });

    it('labels deal runs with the property address and stage', async () => {
      prisma.automationRun.findMany.mockResolvedValue([
        { id: 'r3', entityType: 'deal', entityId: 'deal-1' },
      ]);
      prisma.deal.findMany.mockResolvedValue([
        {
          id: 'deal-1',
          stage: 'contacted',
          property: { address: '9 Elm St', city: 'Austin', state: 'TX' },
        },
      ]);
      const runs = await service().listRuns('acct', {});
      expect(prisma.lead.findMany).not.toHaveBeenCalled();
      expect(runs[0].entity).toEqual({
        label: '9 Elm St, Austin, TX',
        status: 'contacted',
        score: null,
      });
    });
  });

  describe('Outreach Drafter actions', () => {
    const dealRun = { ...baseRun, entityType: 'deal', entityId: 'deal-1' };
    const inbound = {
      id: 'msg-1',
      metadata: { to: '+15550000000' },
      leadId: 'lead-1',
      dealId: 'deal-1',
    };

    beforeEach(() => {
      prisma.automationRun.findFirst.mockResolvedValue({ ...dealRun });
      prisma.message.findFirst.mockResolvedValue({
        ...inbound,
        channel: 'sms',
        counterpartyEnc: 'enc',
      });
    });

    it('records a rule opt-out on its own through the compliance service and classifies the reply', async () => {
      const decision: AgentDecision = {
        agent: 'outreach_drafter',
        promptVersion: 'outreach_drafter.v1',
        model: null,
        recommendation: 'opt_out',
        summary: 's',
        rationale: 'r',
        hardRule: 'opt_out_phrase',
        actions: [
          {
            type: 'classify_inbound',
            messageId: 'msg-1',
            intent: 'opt_out',
            confidence: 1,
            method: 'rule',
          },
          {
            type: 'record_opt_out',
            messageId: 'msg-1',
            reason: 'Seller wrote: "stop texting"',
            gated: false,
          },
          { type: 'append_note', note: 'n' },
        ],
      };

      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision,
      });

      expect(prisma.message.update).toHaveBeenCalledWith({
        where: { id: 'msg-1' },
        data: {
          metadata: {
            to: '+15550000000',
            intent: 'opt_out',
            intentConfidence: 1,
            intentMethod: 'rule',
            classifiedByRunId: 'run-1',
          },
        },
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'DEAL',
          entityId: 'deal-1',
          eventType: 'INBOUND_CLASSIFIED',
        }),
      );
      expect(optOut.recordPhoneOptOut).toHaveBeenCalledWith({
        accountIds: ['acct'],
        phone: '+15551234567',
        source: 'agent:outreach_drafter:run-1',
        reason: 'Seller wrote: "stop texting"',
      });
      expect(automation.completeRun).toHaveBeenCalledWith(
        'run-1',
        'acct',
        expect.objectContaining({
          outputJson: expect.objectContaining({ applied: 3 }),
        }),
      );
    });

    it('holds an unsure model opt-out for a person, then records it on approval', async () => {
      const decision: AgentDecision = {
        agent: 'outreach_drafter',
        promptVersion: 'outreach_drafter.v1',
        model: 'gpt-4o',
        recommendation: 'opt_out',
        summary: 's',
        rationale: 'r',
        hardRule: null,
        actions: [
          {
            type: 'record_opt_out',
            messageId: 'msg-1',
            reason: 'maybe',
            gated: true,
          },
        ],
      };
      await service().recordDecision('acct', 'run-1', {
        status: 'AWAITING_APPROVAL',
        decision,
      });
      expect(optOut.recordPhoneOptOut).not.toHaveBeenCalled();
      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.status).toBe('AWAITING_APPROVAL');

      prisma.automationRun.findFirst.mockResolvedValue({
        ...dealRun,
        status: 'AWAITING_APPROVAL',
        decisionJson: {
          ...decision,
          outcomes: [{ action: decision.actions[0], result: 'pending' }],
        },
      });
      await service().approve('acct', 'run-1', 'user-1');
      expect(optOut.recordPhoneOptOut).toHaveBeenCalledTimes(1);
    });

    it('tags the lead on a wrong number', async () => {
      prisma.deal.findFirst.mockResolvedValue({ leadId: 'lead-1' });
      prisma.lead.findFirst.mockResolvedValue({
        id: 'lead-1',
        tags: ['owner:absentee'],
      });
      const decision: AgentDecision = {
        agent: 'outreach_drafter',
        promptVersion: 'outreach_drafter.v1',
        model: null,
        recommendation: 'wrong_number',
        summary: 's',
        rationale: 'r',
        hardRule: 'wrong_number_phrase',
        actions: [{ type: 'flag_contact', reason: 'wrong_number', note: 'n' }],
      };
      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision,
      });
      expect(prisma.lead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', accountId: 'acct' },
        data: { tags: ['owner:absentee', 'contact:wrong_number'] },
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'LEAD',
          entityId: 'lead-1',
          eventType: 'CONTACT_FLAGGED',
        }),
      );
    });

    it('on approval drafts the reply on the deal and moves it to negotiating as the approver', async () => {
      const draft = {
        type: 'draft_message',
        channel: 'sms',
        recipientType: 'seller',
        content: 'Thanks Pat, is a call this week ok?',
        inReplyToMessageId: 'msg-1',
        gated: true,
      };
      const move = {
        type: 'transition_deal',
        to: 'negotiating',
        reason: 'interest',
        gated: true,
      };
      prisma.automationRun.findFirst.mockResolvedValue({
        ...dealRun,
        status: 'AWAITING_APPROVAL',
        decisionJson: {
          agent: 'outreach_drafter',
          recommendation: 'interested',
          summary: 's',
          actions: [draft, move],
          outcomes: [
            { action: draft, result: 'pending' },
            { action: move, result: 'pending' },
          ],
        },
      });
      prisma.deal.findFirst.mockResolvedValue({
        id: 'deal-1',
        lead: { canonicalPhoneHash: 'ph', canonicalEmailHash: null },
      });
      agentService.draftMessage.mockResolvedValue({ message: { id: 'm9' } });

      await service().approve('acct', 'run-1', 'user-1');

      expect(agentService.draftMessage).toHaveBeenCalledWith(
        'deal-1',
        'acct',
        'sms',
        'seller',
        {
          content: 'Thanks Pat, is a call this week ok?',
          subject: undefined,
          agentName: 'outreach_drafter',
          workflowName: 'agent:outreach_drafter',
          automationRunId: 'run-1',
          metadata: { inReplyToMessageId: 'msg-1' },
        },
      );
      expect(deals.create).not.toHaveBeenCalled();
      expect(deals.updateStage).toHaveBeenCalledWith(
        'deal-1',
        'acct',
        'negotiating',
        'user-1',
        'user',
      );
      expect(automation.completeRun).toHaveBeenCalledWith(
        'run-1',
        'acct',
        expect.objectContaining({
          outputJson: expect.objectContaining({
            applied: 2,
            messageIds: ['m9'],
          }),
        }),
      );
    });
  });

  describe('sweepFollowUps', () => {
    it('queues a follow-up for quiet deals and leaves answered or pending ones alone', async () => {
      prisma.deal.findMany.mockResolvedValue([
        { id: 'd-quiet', accountId: 'acct' },
        { id: 'd-replied', accountId: 'acct' },
        { id: 'd-pending', accountId: 'acct' },
        { id: 'd-recent', accountId: 'acct' },
      ]);
      const old = new Date('2026-10-05T12:00:00.000Z');
      prisma.message.findFirst.mockImplementation(async ({ where }: any) => {
        switch (where.dealId) {
          case 'd-quiet':
            return {
              direction: 'outbound',
              status: 'delivered',
              createdAt: old,
            };
          case 'd-replied':
            return {
              direction: 'inbound',
              status: 'delivered',
              createdAt: old,
            };
          case 'd-pending':
            return {
              direction: 'outbound',
              status: 'pending_approval',
              createdAt: old,
            };
          default:
            return {
              direction: 'outbound',
              status: 'sent',
              createdAt: new Date('2026-10-11T12:00:00.000Z'),
            };
        }
      });

      await expect(
        service().sweepFollowUps(new Date('2026-10-12T07:00:00.000Z'), 3),
      ).resolves.toBe(1);

      expect(queues.enqueueAgent).toHaveBeenCalledTimes(1);
      expect(queues.enqueueAgent).toHaveBeenCalledWith({
        agent: 'outreach_drafter',
        accountId: 'acct',
        entityType: 'deal',
        entityId: 'd-quiet',
        trigger: 'sweep',
        triggerEventId: 'sweep:2026-10-12',
      });
    });
  });

  describe('Disposition Matcher actions', () => {
    const dealRun = { ...baseRun, entityType: 'deal', entityId: 'deal-1' };
    const shortlist = [
      {
        buyerId: 'b1',
        name: 'Sarah Johnson',
        rank: 1,
        fit: 'strong',
        reason: 'fits',
        ruleScore: 99,
      },
      {
        buyerId: 'b2',
        name: 'Open Buyer',
        rank: 2,
        fit: 'possible',
        reason: 'open box',
        ruleScore: 22,
      },
    ];
    const ranking: AgentDecision = {
      agent: 'disposition_matcher',
      promptVersion: 'disposition_matcher.v1',
      model: 'gpt-4o',
      recommendation: 'market',
      summary: 'market: 2 of 3 buyers shortlisted (1 strong); blast drafted',
      rationale: 'r',
      hardRule: null,
      actions: [
        {
          type: 'rank_buyers',
          shortlist: shortlist as any,
          consideredCount: 3,
        },
        { type: 'append_note', note: 'r' },
        {
          type: 'queue_buyer_blast',
          buyerIds: ['b1', 'b2'],
          subject: 'Memphis SFH under contract',
          body: '654 Birch Rd. Reply if interested.',
          gated: true,
        },
      ],
    };

    beforeEach(() => {
      prisma.automationRun.findFirst.mockResolvedValue({ ...dealRun });
      prisma.deal.findFirst.mockResolvedValue({ id: 'deal-1' });
    });

    it('records the ranking on the deal at once and holds the blast for a person', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'AWAITING_APPROVAL',
        decision: ranking,
        costUsd: 0.02,
      });

      expect(prisma.marketingMaterial.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          dealId: 'deal-1',
          type: 'buyer_shortlist',
          content:
            '1. Sarah Johnson (strong): fits\n2. Open Buyer (possible): open box',
          metadata: expect.objectContaining({
            consideredCount: 3,
            automationRunId: 'run-1',
          }),
        }),
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'DEAL',
          entityId: 'deal-1',
          eventType: 'BUYERS_RANKED',
        }),
      );
      expect(communications.create).not.toHaveBeenCalled();
      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.status).toBe('AWAITING_APPROVAL');
      expect(data.decisionJson.outcomes.map((o: any) => o.result)).toEqual([
        'applied',
        'applied',
        'pending',
      ]);
    });

    it('on approval creates one pending-approval email per buyer through the compliance path', async () => {
      prisma.automationRun.findFirst.mockResolvedValue({
        ...dealRun,
        status: 'AWAITING_APPROVAL',
        decisionJson: {
          ...ranking,
          outcomes: [
            { action: ranking.actions[0], result: 'applied' },
            { action: ranking.actions[1], result: 'applied' },
            { action: ranking.actions[2], result: 'pending' },
          ],
        },
      });
      prisma.buyer.findMany.mockResolvedValue([
        { id: 'b1', name: 'Sarah Johnson', emailEnc: 'enc-sarah' },
        { id: 'b2', name: 'Open Buyer', emailEnc: null },
      ]);
      communications.create.mockResolvedValue({ id: 'm-blast-1' });

      await service().approve('acct', 'run-1', 'user-1');

      expect(communications.create).toHaveBeenCalledTimes(1);
      expect(communications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          accountId: 'acct',
          dealId: 'deal-1',
          channel: 'email',
          direction: 'outbound',
          content: '654 Birch Rd. Reply if interested.',
          source: 'agent',
          agentName: 'disposition_matcher',
          automationRunId: 'run-1',
          metadata: expect.objectContaining({
            email: 'open:enc-sarah',
            recipientType: 'buyer',
            buyerId: 'b1',
            type: 'buyer_blast',
            subject: 'Memphis SFH under contract',
          }),
        }),
      );
      const material = prisma.marketingMaterial.create.mock.calls.find(
        (c: any) => c[0].data.type === 'buyer_blast',
      )[0].data;
      expect(material.metadata).toMatchObject({
        buyerIds: ['b1', 'b2'],
        messageIds: ['m-blast-1'],
        skipped: ['Open Buyer: no email'],
      });
      expect(automation.completeRun).toHaveBeenCalledWith(
        'run-1',
        'acct',
        expect.objectContaining({
          outputJson: expect.objectContaining({ messageIds: ['m-blast-1'] }),
        }),
      );
    });

    it('reports a blast that produced no draft as failed without losing the approval', async () => {
      prisma.automationRun.findFirst.mockResolvedValue({
        ...dealRun,
        status: 'AWAITING_APPROVAL',
        decisionJson: {
          ...ranking,
          outcomes: [{ action: ranking.actions[2], result: 'pending' }],
        },
      });
      prisma.buyer.findMany.mockResolvedValue([
        { id: 'b1', name: 'Sarah Johnson', emailEnc: 'enc-sarah' },
      ]);
      communications.create.mockRejectedValue(
        new Error('Communications are currently disabled'),
      );

      await service().approve('acct', 'run-1', 'user-1');

      const data = prisma.automationRun.update.mock.calls[0][0].data;
      expect(data.decisionJson.outcomes[0]).toMatchObject({
        result: 'failed',
        detail: expect.stringContaining(
          'Communications are currently disabled',
        ),
      });
      expect(automation.completeRun).toHaveBeenCalled();
    });
  });

  describe('gaps closed after the audit', () => {
    const flush = () => new Promise((r) => setImmediate(r));

    it('skip traces a lead right after the Lead Analyst scores it high enough', async () => {
      prisma.lead.findFirst.mockResolvedValue({
        canonicalPhoneHash: null,
        canonicalEmailHash: null,
      });
      await service().recordDecision('acct', 'run-1', {
        status: 'AWAITING_APPROVAL',
        decision: qualified,
        costUsd: 0.01,
      });
      await flush();
      await flush();
      expect(skipTrace.traceLead).toHaveBeenCalledWith({
        accountId: 'acct',
        leadId: 'lead-1',
        actor: 'system',
        automated: true,
      });
      expect(timeline.appendEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'SKIP_TRACE_AFTER_SCORE',
          entityId: 'lead-1',
        }),
      );
    });

    it('does not skip trace a disqualified, low-scored, or already-reachable lead', async () => {
      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: ruleDisqualify,
      });
      const low: AgentDecision = {
        ...qualified,
        recommendation: 'hold',
        actions: [{ type: 'set_lead_score', score: 40 }],
      };
      await service().recordDecision('acct', 'run-1', {
        status: 'COMPLETED',
        decision: low,
      });
      prisma.lead.findFirst.mockResolvedValue({
        canonicalPhoneHash: 'ph',
        canonicalEmailHash: null,
      });
      await service().recordDecision('acct', 'run-1', {
        status: 'AWAITING_APPROVAL',
        decision: qualified,
      });
      await flush();
      await flush();
      expect(skipTrace.traceLead).not.toHaveBeenCalled();
    });

    it('keeps the run open when a Texas buyer blast lacks the equitable-interest notice', async () => {
      const blast = {
        type: 'queue_buyer_blast',
        buyerIds: ['b1'],
        subject: 's',
        body: 'b',
        gated: true,
      };
      prisma.automationRun.findFirst.mockResolvedValue({
        ...baseRun,
        entityType: 'deal',
        entityId: 'deal-1',
        status: 'AWAITING_APPROVAL',
        decisionJson: {
          agent: 'disposition_matcher',
          recommendation: 'market',
          summary: 's',
          actions: [blast],
          outcomes: [{ action: blast, result: 'pending' }],
        },
      });
      disclosure.assertEquitableInterest.mockRejectedValue(
        Object.assign(
          new Error('Texas requires the equitable-interest disclosure'),
          { status: 403 },
        ),
      );

      await expect(
        service().approve('acct', 'run-1', 'user-1'),
      ).rejects.toThrow(/equitable-interest disclosure/);
      expect(disclosure.assertEquitableInterest).toHaveBeenCalledWith(
        'acct',
        'deal-1',
        'marketing this deal to buyers',
      );
      expect(communications.create).not.toHaveBeenCalled();
      expect(automation.approveRun).not.toHaveBeenCalled();
    });
  });
});
