import { BadRequestException } from '@nestjs/common';
import { AgentController } from '../agent.controller';

const orchestration = {
  enqueue: jest.fn(),
  listRuns: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn(),
};

const controller = () =>
  new AgentController({} as never, orchestration as never);

describe('AgentController.queueAgentRun', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orchestration.enqueue.mockResolvedValue(true);
  });

  const queue = (body: Record<string, unknown>) =>
    controller().queueAgentRun('acct', 'user-1', body);

  it("defaults to the agent's own entity and normalizes a state name", async () => {
    await queue({ agent: 'market_expansion', entityId: 'texas' });
    expect(orchestration.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'market_expansion',
        entityType: 'market',
        entityId: 'TX',
        trigger: 'manual',
        actorId: 'user-1',
      }),
    );
  });

  it('takes US for the nationwide brief, and only for Market Intelligence', async () => {
    await queue({ agent: 'market_intelligence', entityId: 'us' });
    expect(orchestration.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'market', entityId: 'US' }),
    );
    await expect(
      queue({ agent: 'market_expansion', entityId: 'US' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses an entity the agent does not work on', async () => {
    await expect(
      queue({ agent: 'lead_analyst', entityType: 'market', entityId: 'TX' }),
    ).rejects.toThrow('lead_analyst works on lead');
    await expect(
      queue({ agent: 'market_expansion', entityType: 'deal', entityId: 'd1' }),
    ).rejects.toThrow('market_expansion works on market');
    expect(orchestration.enqueue).not.toHaveBeenCalled();
  });

  it('keeps lead and deal runs as they were', async () => {
    await queue({ agent: 'deal_underwriter', entityId: 'deal-1' });
    expect(orchestration.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'deal', entityId: 'deal-1' }),
    );
  });
});
