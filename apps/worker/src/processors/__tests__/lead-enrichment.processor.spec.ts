const mockTx = {
  lead: { findFirst: jest.fn(), updateMany: jest.fn() },
  leadEnrichmentJob: { findFirst: jest.fn(), create: jest.fn() },
  timelineEvent: { create: jest.fn().mockResolvedValue({}) },
};
const mockPrisma = {
  $transaction: jest.fn(async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx)),
  sourceRecord: { findFirst: jest.fn() },
  integrationCostEvent: { findFirst: jest.fn() },
};
jest.mock('../../prisma-client', () => ({ prisma: mockPrisma }));

import { LeadEnrichmentProcessor } from '../lead-enrichment.processor';

const processor = () => new LeadEnrichmentProcessor() as any;
const job = { id: 'job-1', metadata: null, startedAt: new Date('2026-07-28T00:00:00.000Z') };

describe('LeadEnrichmentProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTx.leadEnrichmentJob.create.mockResolvedValue({ ...job, id: 'job-new' });
    mockTx.lead.updateMany.mockResolvedValue({ count: 1 });
  });

  it('readProgress restores persisted enrichment step metadata', () => {
    const progress = processor().readProgress({
      geocode: { sourceRecordId: 'geo-1', cost: 0.005 },
      attom: { sourceRecordId: 'attom-1', cost: 0.1 },
      skipTrace: { phone: '+15551234567', email: null, costUsd: 0.25 },
    });

    expect(progress).toEqual({
      geocode: { sourceRecordId: 'geo-1', cost: 0.005 },
      attom: { sourceRecordId: 'attom-1', cost: 0.1 },
      skipTrace: { phone: '+15551234567', email: null, costUsd: 0.25 },
    });
  });

  it('recoverCompletedSourceStep reuses worker output written before a stalled replay', async () => {
    mockPrisma.sourceRecord.findFirst.mockResolvedValue({ id: 'src-1' });
    mockPrisma.integrationCostEvent.findFirst.mockResolvedValue({
      actualCostUsd: 0.1,
      estimatedCostUsd: 0.1,
    });

    const result = await processor().recoverCompletedSourceStep({
      accountId: 'acct-1',
      leadId: 'lead-1',
      providerKey: 'attom',
      action: 'property_expanded_profile',
      requestHash: 'hash-1',
      startedAt: job.startedAt,
    });

    expect(result).toEqual({ sourceRecordId: 'src-1', cost: 0.1 });
  });

  describe('startEnrichment', () => {
    it('resumes the unfinished job when the lead is already enriching', async () => {
      // A previous attempt moved the lead and died; the replay must not try
      // an illegal enriching -> enriching transition, nor open a second job.
      mockTx.lead.findFirst.mockResolvedValue({ status: 'enriching' });
      mockTx.leadEnrichmentJob.findFirst.mockResolvedValue(job);

      const handle = await processor().startEnrichment('lead-1', 'acct-1');

      expect(handle).toEqual(job);
      expect(mockTx.lead.updateMany).not.toHaveBeenCalled();
      expect(mockTx.leadEnrichmentJob.create).not.toHaveBeenCalled();
      expect(mockTx.timelineEvent.create).not.toHaveBeenCalled();
    });

    it('opens a fresh job for a lead stuck in enriching with no unfinished job', async () => {
      mockTx.lead.findFirst.mockResolvedValue({ status: 'enriching' });
      mockTx.leadEnrichmentJob.findFirst.mockResolvedValue(null);

      const handle = await processor().startEnrichment('lead-1', 'acct-1');

      expect(handle.id).toBe('job-new');
      expect(mockTx.lead.updateMany).not.toHaveBeenCalled();
      expect(mockTx.leadEnrichmentJob.create).toHaveBeenCalledTimes(1);
    });

    it('transitions a new lead into enriching and opens a job', async () => {
      mockTx.lead.findFirst.mockResolvedValue({ status: 'new' });

      const handle = await processor().startEnrichment('lead-1', 'acct-1');

      expect(handle.id).toBe('job-new');
      expect(mockTx.lead.updateMany).toHaveBeenCalledWith({
        where: { id: 'lead-1', accountId: 'acct-1', status: 'new' },
        data: { status: 'enriching' },
      });
      expect(mockTx.leadEnrichmentJob.findFirst).not.toHaveBeenCalled();
      expect(mockTx.timelineEvent.create).toHaveBeenCalledTimes(1);
    });

    it('refuses a lead that can no longer be enriched', async () => {
      mockTx.lead.findFirst.mockResolvedValue({ status: 'disqualified' });

      const handle = await processor().startEnrichment('lead-1', 'acct-1');

      expect(handle).toBeNull();
      expect(mockTx.lead.updateMany).not.toHaveBeenCalled();
      expect(mockTx.leadEnrichmentJob.create).not.toHaveBeenCalled();
    });

    it('backs off when the status changed between read and write', async () => {
      mockTx.lead.findFirst.mockResolvedValue({ status: 'new' });
      mockTx.lead.updateMany.mockResolvedValue({ count: 0 });

      const handle = await processor().startEnrichment('lead-1', 'acct-1');

      expect(handle).toBeNull();
      expect(mockTx.leadEnrichmentJob.create).not.toHaveBeenCalled();
    });
  });
});
