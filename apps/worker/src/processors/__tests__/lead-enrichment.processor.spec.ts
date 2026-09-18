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

const mockGeocode = jest.fn();
const mockPropertyLookup = jest.fn();
jest.mock('../../internal-api.client', () => {
  const actual = jest.requireActual('../../internal-api.client');
  return {
    ...actual,
    geocode: (...args: unknown[]) => mockGeocode(...args),
    propertyLookup: (...args: unknown[]) => mockPropertyLookup(...args),
  };
});

import {
  CostBlockedError,
  IntegrationUnavailableError,
  InternalApiError,
} from '../../internal-api.client';
import * as crypto from 'crypto';
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

  describe('paid steps via the internal api', () => {
    const addr = { address: '1 Main St', city: 'Austin', state: 'TX', zip: '78701' };

    it('geocodes through the api and records its cost', async () => {
      mockGeocode.mockResolvedValue({ sourceRecordId: 'src-geo', costUsd: 0.005, cached: false });

      const out = await processor().geocodeAddress('acct-1', addr.address, addr.city, addr.state, addr.zip, 'lead-1');

      expect(out).toEqual({ sourceRecordId: 'src-geo', cost: 0.005 });
      expect(mockGeocode).toHaveBeenCalledWith('acct-1', { ...addr, leadId: 'lead-1' });
    });

    it('skips a step the api blocked on budget instead of failing the job', async () => {
      mockPropertyLookup.mockRejectedValue(
        new CostBlockedError('BLOCK_OVER_BUDGET', 'attom', 'over budget'),
      );

      const out = await processor().lookupAttom('acct-1', addr.address, addr.city, addr.state, addr.zip, 'lead-1');

      expect(out).toEqual({ sourceRecordId: null, cost: 0 });
    });

    it('skips a step whose provider is unavailable (e.g. rejected credentials)', async () => {
      mockPropertyLookup.mockRejectedValue(
        new IntegrationUnavailableError('attom', 'REJECTED_CREDENTIALS', 'ATTOM rejected the key'),
      );

      const out = await processor().lookupAttom('acct-1', addr.address, addr.city, addr.state, addr.zip, 'lead-1');

      expect(out).toEqual({ sourceRecordId: null, cost: 0 });
    });

    it('propagates anything else so BullMQ retries', async () => {
      mockGeocode.mockRejectedValue(new InternalApiError(500, 'boom'));

      await expect(
        processor().geocodeAddress('acct-1', addr.address, addr.city, addr.state, addr.zip, 'lead-1'),
      ).rejects.toThrow(InternalApiError);
    });

    it('hashes the request the way the api stores SourceRecords, so replay recovery finds them', () => {
      const expected = crypto
        .createHash('sha256')
        .update(JSON.stringify({ address: '1 Main St, Austin, TX, 78701' }))
        .digest('hex');
      expect(processor().hashAddressQuery(addr.address, addr.city, addr.state, addr.zip)).toBe(expected);
    });
  });
});
