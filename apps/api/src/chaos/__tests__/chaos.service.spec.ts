import { Queue } from 'bullmq';
import { ChaosService } from '../chaos.service';

jest.mock('bullmq', () => ({
  Queue: jest.fn(),
}));

describe('ChaosService', () => {
  let service: ChaosService;
  let prisma: any;
  let redis: any;
  let queueInstances: Map<string, any>;

  beforeEach(() => {
    prisma = {
      message: {
        findUnique: jest.fn(),
      },
      lead: {
        findUnique: jest.fn(),
      },
    };

    redis = {
      duplicate: jest.fn(() => ({})),
      hset: jest.fn(),
      del: jest.fn(),
      hgetall: jest.fn().mockResolvedValue({}),
      hget: jest.fn().mockResolvedValue(null),
    };

    queueInstances = new Map();
    const QueueMock = Queue as unknown as jest.Mock;
    QueueMock.mockImplementation((name: string) => {
      if (!queueInstances.has(name)) {
        queueInstances.set(name, {
          getFailed: jest.fn().mockResolvedValue([]),
          getJob: jest.fn().mockResolvedValue(null),
          close: jest.fn().mockResolvedValue(undefined),
        });
      }
      return queueInstances.get(name);
    });

    service = new ChaosService(redis as any, prisma as any);
  });

  it('lists only failed jobs owned by the caller tenant', async () => {
    queueInstances.set('communications', {
      getFailed: jest.fn().mockResolvedValue([
        {
          id: 'job-msg-1',
          name: 'send',
          data: { messageId: 'msg-1' },
          failedReason: 'boom',
          attemptsMade: 2,
          timestamp: 111,
        },
        {
          id: 'job-msg-2',
          name: 'send',
          data: { messageId: 'msg-2' },
          failedReason: 'boom',
          attemptsMade: 1,
          timestamp: 222,
        },
      ]),
      getJob: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    });
    queueInstances.set('lead-enrichment', {
      getFailed: jest.fn().mockResolvedValue([
        {
          id: 'job-lead-1',
          name: 'enrich',
          data: { leadId: 'lead-1' },
          failedReason: 'timeout',
          attemptsMade: 3,
          timestamp: 333,
        },
      ]),
      getJob: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    });
    queueInstances.set('underwriting', {
      getFailed: jest.fn().mockResolvedValue([
        {
          id: 'job-under-1',
          name: 'UNDERWRITE_DEAL',
          data: { tenantId: 'tenant-1', dealId: 'deal-1', jobRunId: 'run-1' },
          failedReason: 'openai',
          attemptsMade: 1,
          timestamp: 444,
        },
        {
          id: 'job-under-2',
          name: 'UNDERWRITE_DEAL',
          data: { tenantId: 'tenant-2', dealId: 'deal-2', jobRunId: 'run-2' },
          failedReason: 'openai',
          attemptsMade: 1,
          timestamp: 555,
        },
      ]),
      getJob: jest.fn(),
      close: jest.fn().mockResolvedValue(undefined),
    });

    prisma.message.findUnique.mockImplementation(async (args: any) => {
      if (args.where.id === 'msg-1') return { accountId: 'tenant-1' };
      if (args.where.id === 'msg-2') return { accountId: 'tenant-2' };
      return null;
    });
    prisma.lead.findUnique.mockResolvedValue({ accountId: 'tenant-1' });

    const jobs = await service.listFailedJobs('tenant-1');

    expect(jobs).toEqual([
      expect.objectContaining({
        id: 'job-msg-1',
        queue: 'communications',
        data: { messageId: 'msg-1' },
      }),
      expect.objectContaining({
        id: 'job-lead-1',
        queue: 'lead-enrichment',
        data: { leadId: 'lead-1' },
      }),
      expect.objectContaining({
        id: 'job-under-1',
        queue: 'underwriting',
        data: { tenantId: 'tenant-1', dealId: 'deal-1', jobRunId: 'run-1' },
      }),
    ]);
  });

  it('replays jobs owned by the caller tenant', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    queueInstances.set('communications', {
      getFailed: jest.fn(),
      getJob: jest.fn().mockResolvedValue({
        id: 'job-msg-1',
        data: { messageId: 'msg-1' },
        retry,
      }),
      close: jest.fn().mockResolvedValue(undefined),
    });
    prisma.message.findUnique.mockResolvedValue({ accountId: 'tenant-1' });

    await expect(
      service.replayJob('communications', 'job-msg-1', 'tenant-1'),
    ).resolves.toEqual({ success: true, jobId: 'job-msg-1' });
    expect(retry).toHaveBeenCalled();
  });

  it('hides foreign jobs from replay callers', async () => {
    const retry = jest.fn().mockResolvedValue(undefined);
    queueInstances.set('communications', {
      getFailed: jest.fn(),
      getJob: jest.fn().mockResolvedValue({
        id: 'job-msg-2',
        data: { messageId: 'msg-2' },
        retry,
      }),
      close: jest.fn().mockResolvedValue(undefined),
    });
    prisma.message.findUnique.mockResolvedValue({ accountId: 'tenant-2' });

    await expect(
      service.replayJob('communications', 'job-msg-2', 'tenant-1'),
    ).resolves.toEqual({ success: false, error: 'Job not found' });
    expect(retry).not.toHaveBeenCalled();
  });
});
