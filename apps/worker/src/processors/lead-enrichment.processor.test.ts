import test from 'node:test';
import assert from 'node:assert/strict';
import { LeadEnrichmentProcessor } from './lead-enrichment.processor';
import { prisma } from '../prisma-client';

test('readProgress restores persisted enrichment step metadata', () => {
  const processor = new LeadEnrichmentProcessor() as any;

  const progress = processor.readProgress({
    geocode: { sourceRecordId: 'geo-1', cost: 0.005 },
    attom: { sourceRecordId: 'attom-1', cost: 0.1 },
    skipTrace: { phone: '+15551234567', email: null, costUsd: 0.25 },
  });

  assert.deepEqual(progress, {
    geocode: { sourceRecordId: 'geo-1', cost: 0.005 },
    attom: { sourceRecordId: 'attom-1', cost: 0.1 },
    skipTrace: { phone: '+15551234567', email: null, costUsd: 0.25 },
  });
});

test('recoverCompletedSourceStep reuses worker output written before a stalled replay', async () => {
  const processor = new LeadEnrichmentProcessor() as any;
  const originalSourceFindFirst = prisma.sourceRecord.findFirst;
  const originalCostFindFirst = prisma.integrationCostEvent.findFirst;

  (prisma.sourceRecord as any).findFirst = async () => ({ id: 'src-1' });
  (prisma.integrationCostEvent as any).findFirst = async () => ({
    actualCostUsd: 0.1,
    estimatedCostUsd: 0.1,
  });

  try {
    const result = await processor.recoverCompletedSourceStep({
      accountId: 'acct-1',
      leadId: 'lead-1',
      providerKey: 'attom',
      action: 'property_expanded_profile',
      requestHash: 'hash-1',
      startedAt: new Date('2026-07-28T00:00:00.000Z'),
    });

    assert.deepEqual(result, {
      sourceRecordId: 'src-1',
      cost: 0.1,
    });
  } finally {
    (prisma.sourceRecord as any).findFirst = originalSourceFindFirst;
    (prisma.integrationCostEvent as any).findFirst = originalCostFindFirst;
  }
});
