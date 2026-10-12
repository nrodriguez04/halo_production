import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { transitionLeadStatus } from '@halo/shared';
import { prisma } from '../prisma-client';
import { getControlPlane } from '../control-plane';
import {
  CostBlockedError,
  IntegrationUnavailableError,
  geocode as geocodeViaApi,
  propertyLookup as propertyLookupViaApi,
  skipTrace as skipTraceViaApi,
} from '../internal-api.client';

// Lead enrichment processor. Performs the staged enrichment funnel:
//   1. Geocode the lead address (Google Geocoding)
//   2. Pull property data (ATTOM)
//   3. Skip trace
//
// Every paid step goes through the api's /internal routes, so the
// cost-control decision tree, budgets, rate limits and the idempotency
// window apply before any provider is called, and the ledger row is the
// api's. A step the api refuses for budget or availability reasons is
// skipped (recorded as no source record, zero cost) rather than failing the
// whole job, matching the old hard-cap short-circuit. Skip-trace providers
// live behind the SkipTraceService adapter.
//
// The worker never sees a traced phone or email: the api stores them on the
// lead, encrypted, and returns counts. The job metadata used to keep them in
// plaintext.

interface EnrichmentStepResult {
  sourceRecordId: string | null;
  cost: number;
}

/** Outcome of the skip-trace step, as persisted in the job metadata. */
interface SkipTraceResult {
  status: string;
  reason?: string;
  costUsd: number;
  phoneFound: boolean;
  emailFound: boolean;
}

interface LeadEnrichmentProgress {
  geocode?: EnrichmentStepResult;
  attom?: EnrichmentStepResult;
  skipTrace?: SkipTraceResult;
}

interface EnrichmentJobHandle {
  id: string;
  metadata: unknown;
  startedAt: Date;
}

@Processor('lead-enrichment')
export class LeadEnrichmentProcessor extends WorkerHost {
  async process(job: Job<{ leadId: string }>) {
    const { leadId } = job.data;

    try {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const controlPlane = await getControlPlane(lead.accountId);
      if (!controlPlane.enabled) {
        console.warn(`Kill switch active — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'kill_switch_active' };
      }
      if (controlPlane && !controlPlane.externalDataEnabled) {
        console.warn(`External data disabled — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'external_data_disabled' };
      }

      const accountId = lead.accountId;

      // Move the lead into `enriching` through the shared state machine, or
      // pick the unfinished job back up if a previous attempt already did
      // and then died (BullMQ stalled-job recovery replays the job).
      const enrichmentJob = await this.startEnrichment(leadId, accountId);
      if (!enrichmentJob) {
        return { success: false, leadId, reason: 'lead_no_longer_enrichable' };
      }
      const progress = this.readProgress(enrichmentJob.metadata);
      const address = lead.canonicalAddress || '';
      const city = lead.canonicalCity || undefined;
      const state = lead.canonicalState || undefined;
      const zip = lead.canonicalZip || undefined;

      let geocodeResult =
        progress.geocode ??
        (await this.recoverCompletedSourceStep({
          accountId,
          leadId,
          providerKey: 'google_geocoding',
          action: 'geocode',
          requestHash: this.hashAddressQuery(address, city, state, zip),
          startedAt: enrichmentJob.startedAt,
        }));
      if (!geocodeResult) {
        geocodeResult = await this.geocodeAddress(
          accountId,
          address,
          city,
          state,
          zip,
          leadId,
        );
      }
      if (!progress.geocode) {
        progress.geocode = geocodeResult;
        await this.persistProgress(enrichmentJob.id, 'attom', progress);
      }

      let attomResult =
        progress.attom ??
        (await this.recoverCompletedSourceStep({
          accountId,
          leadId,
          providerKey: 'attom',
          action: 'property_expanded_profile',
          requestHash: this.hashAddressQuery(address, city, state, zip),
          startedAt: enrichmentJob.startedAt,
        }));
      if (!attomResult) {
        attomResult = await this.lookupAttom(
          accountId,
          address,
          city,
          state,
          zip,
          leadId,
        );
      }
      if (!progress.attom) {
        progress.attom = attomResult;
        await this.persistProgress(enrichmentJob.id, 'skip_trace', progress);
      }

      if (geocodeResult.sourceRecordId) {
        await prisma.sourceRecord.update({
          where: { id: geocodeResult.sourceRecordId },
          data: { leadId },
        });
      }
      if (attomResult.sourceRecordId) {
        await prisma.sourceRecord.update({
          where: { id: attomResult.sourceRecordId },
          data: { leadId },
        });
      }

      // Skip trace via api so cost-control's decision tree runs.
      let skipTrace = progress.skipTrace;
      if (!skipTrace) {
        skipTrace = await this.skipTraceStep(accountId, leadId);
        if (this.shouldPersistSkipTrace(skipTrace)) {
          progress.skipTrace = skipTrace;
          await this.persistProgress(enrichmentJob.id, 'skip_trace', progress);
        }
      }

      const finalized = await this.completeEnrichment({
        leadId,
        accountId,
        enrichmentJobId: enrichmentJob.id,
        totalCostUsd:
          (geocodeResult.cost ?? 0) + (attomResult.cost ?? 0) + (skipTrace.costUsd ?? 0),
        progress,
      });
      if (!finalized) {
        return { success: false, leadId, reason: 'lead_status_changed_during_enrichment' };
      }

      return { success: true, leadId };
    } catch (error) {
      console.error(`Lead enrichment failed for ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Start enrichment only if the lead is still in a state that can
   * legally move into `enriching`. The conditional update keeps a user
   * race from flipping the row underneath a long-running worker.
   */
  private async startEnrichment(
    leadId: string,
    accountId: string,
  ): Promise<EnrichmentJobHandle | null> {
    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: leadId, accountId },
        select: { status: true },
      });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const current = lead.status;

      // Already enriching: a previous attempt moved the lead and then died
      // before finishing. `enriching -> enriching` is not a legal transition,
      // so without this branch a replayed job would be refused and the lead
      // left in `enriching` forever. Resume the unfinished job instead; its
      // metadata records which paid steps already completed.
      if (current === 'enriching') {
        const unfinished = await tx.leadEnrichmentJob.findFirst({
          where: { accountId, leadId, completedAt: null },
          orderBy: { startedAt: 'desc' },
          select: { id: true, metadata: true, startedAt: true },
        });
        if (unfinished) return unfinished;
        return tx.leadEnrichmentJob.create({
          data: { accountId, leadId, stage: 'normalizing' },
          select: { id: true, metadata: true, startedAt: true },
        });
      }

      const result = transitionLeadStatus(current, 'enriching', {
        accountId,
        actorId: null,
        actorType: 'worker',
      });
      if (!result.allowed) {
        console.warn(
          `[lead-enrichment] illegal transition ${current} -> enriching for lead ${leadId}: ${result.reason}`,
        );
        return null;
      }

      const updated = await tx.lead.updateMany({
        where: { id: leadId, accountId, status: current },
        data: { status: 'enriching' },
      });
      if (updated.count !== 1) {
        console.warn(
          `[lead-enrichment] skipped transition ${current} -> enriching for lead ${leadId}; status changed concurrently`,
        );
        return null;
      }

      const enrichmentJob = await tx.leadEnrichmentJob.create({
        data: { accountId, leadId, stage: 'normalizing' },
        select: { id: true, metadata: true, startedAt: true },
      });

      await tx.timelineEvent.create({
        data: {
          tenantId: accountId,
          entityType: 'LEAD',
          entityId: leadId,
          eventType: 'lead.status.enriching',
          actorType: 'system',
          actorId: null,
          payloadJson: { from: current, to: 'enriching' },
        },
      });

      return enrichmentJob;
    });
  }

  /**
   * Finish enrichment against the live lead row so user actions taken
   * while the job was running are not overwritten on completion.
   */
  private async completeEnrichment(params: {
    leadId: string;
    accountId: string;
    enrichmentJobId: string;
    totalCostUsd: number;
    progress: LeadEnrichmentProgress;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: params.leadId, accountId: params.accountId },
        select: { status: true },
      });
      if (!lead) throw new Error(`Lead ${params.leadId} not found`);

      const current = lead.status;
      const result = transitionLeadStatus(current, 'enriched', {
        accountId: params.accountId,
        actorId: null,
        actorType: 'worker',
      });
      if (!result.allowed) {
        console.warn(
          `[lead-enrichment] illegal transition ${current} -> enriched for lead ${params.leadId}: ${result.reason}`,
        );
        return false;
      }

      // Contacts are persisted (encrypted) by the api's skip-trace route;
      // the worker holds no PII keys and writes none of them here.

      const updated = await tx.lead.updateMany({
        where: {
          id: params.leadId,
          accountId: params.accountId,
          status: current,
        },
        data: { status: 'enriched' },
      });
      if (updated.count !== 1) {
        console.warn(
          `[lead-enrichment] skipped transition ${current} -> enriched for lead ${params.leadId}; status changed concurrently`,
        );
        return false;
      }

      await tx.leadEnrichmentJob.updateMany({
        where: { id: params.enrichmentJobId, completedAt: null },
        data: {
          stage: 'completed',
          completedAt: new Date(),
          totalCostUsd: params.totalCostUsd,
          metadata: params.progress as object,
        },
      });

      await tx.timelineEvent.create({
        data: {
          tenantId: params.accountId,
          entityType: 'LEAD',
          entityId: params.leadId,
          eventType: 'lead.status.enriched',
          actorType: 'system',
          actorId: null,
          payloadJson: { from: current, to: 'enriched' },
        },
      });

      return true;
    });
  }

  private readProgress(metadata: unknown): LeadEnrichmentProgress {
    if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object') {
      return {};
    }

    const raw = metadata as Record<string, unknown>;
    const progress: LeadEnrichmentProgress = {};
    const geocode = this.readStoredSourceStep(raw.geocode);
    const attom = this.readStoredSourceStep(raw.attom);
    const skipTrace = this.readStoredSkipTrace(raw.skipTrace);
    if (geocode) progress.geocode = geocode;
    if (attom) progress.attom = attom;
    if (skipTrace) progress.skipTrace = skipTrace;
    return progress;
  }

  private readStoredSourceStep(value: unknown): EnrichmentStepResult | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    const raw = value as Record<string, unknown>;
    return {
      sourceRecordId:
        typeof raw.sourceRecordId === 'string' ? raw.sourceRecordId : null,
      cost: typeof raw.cost === 'number' ? raw.cost : 0,
    };
  }

  /**
   * Also reads the old shape, which held the traced phone and email in
   * plaintext: only whether they were found is carried forward, so the next
   * write of the metadata drops them.
   */
  private readStoredSkipTrace(value: unknown): SkipTraceResult | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    const raw = value as Record<string, unknown>;
    return {
      status: typeof raw.status === 'string' ? raw.status : 'matched',
      ...(typeof raw.reason === 'string' ? { reason: raw.reason } : {}),
      costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : 0,
      phoneFound: raw.phoneFound === true || typeof raw.phone === 'string',
      emailFound: raw.emailFound === true || typeof raw.email === 'string',
    };
  }

  private async recoverCompletedSourceStep(params: {
    accountId: string;
    leadId: string;
    providerKey: string;
    action: string;
    requestHash: string;
    startedAt: Date;
  }): Promise<EnrichmentStepResult | null> {
    const sourceRecord = await prisma.sourceRecord.findFirst({
      where: {
        leadId: params.leadId,
        provider: params.providerKey,
        requestHash: params.requestHash,
        createdAt: { gte: params.startedAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!sourceRecord) {
      return null;
    }

    const costEvent = await prisma.integrationCostEvent.findFirst({
      where: {
        accountId: params.accountId,
        providerKey: params.providerKey,
        action: params.action,
        leadId: params.leadId,
        actor: { in: ['system', 'worker'] },
        createdAt: { gte: params.startedAt },
      },
      orderBy: { createdAt: 'desc' },
      select: { actualCostUsd: true, estimatedCostUsd: true },
    });

    return {
      sourceRecordId: sourceRecord.id,
      cost: costEvent?.actualCostUsd ?? costEvent?.estimatedCostUsd ?? 0,
    };
  }

  private async persistProgress(
    enrichmentJobId: string,
    stage: string,
    progress: LeadEnrichmentProgress,
  ): Promise<void> {
    await prisma.leadEnrichmentJob.update({
      where: { id: enrichmentJobId },
      data: {
        stage,
        metadata: progress as object,
      },
    });
  }

  private shouldPersistSkipTrace(result: SkipTraceResult): boolean {
    return Boolean(result.phoneFound || result.emailFound || result.costUsd > 0);
  }

  private buildAddressQuery(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
  ): string {
    return [address, city, state, zip].filter(Boolean).join(', ');
  }

  private hashAddressQuery(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
  ): string {
    // Must match the api adapters' storeSourceRecord, which hashes the JSON
    // request body; recovery after a stalled replay looks records up by it.
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({ address: this.buildAddressQuery(address, city, state, zip) }))
      .digest('hex');
  }

  // -- enrichment steps -------------------------------------------------

  private async geocodeAddress(
    accountId: string,
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ): Promise<EnrichmentStepResult> {
    return this.enrichmentStep('google_geocoding', () =>
      geocodeViaApi(accountId, { address, city, state, zip, leadId }),
    );
  }

  private async lookupAttom(
    accountId: string,
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ): Promise<EnrichmentStepResult> {
    return this.enrichmentStep('attom', () =>
      propertyLookupViaApi(accountId, { address, city, state, zip, leadId }),
    );
  }

  /**
   * Runs one optional enrichment step through the api. Budget blocks and
   * provider unavailability skip the step; anything else (auth, network,
   * a bug) propagates so BullMQ retries the job.
   */
  private async enrichmentStep(
    provider: string,
    call: () => Promise<{ sourceRecordId: string | null; costUsd: number }>,
  ): Promise<EnrichmentStepResult> {
    try {
      const out = await call();
      return { sourceRecordId: out.sourceRecordId, cost: out.costUsd };
    } catch (error) {
      if (error instanceof CostBlockedError) {
        console.warn(
          `[lead-enrichment] ${provider} skipped: ${error.reason} (cost control)`,
        );
        return { sourceRecordId: null, cost: 0 };
      }
      if (error instanceof IntegrationUnavailableError) {
        console.warn(
          `[lead-enrichment] ${provider} skipped: ${error.reason} (${error.message})`,
        );
        return { sourceRecordId: null, cost: 0 };
      }
      throw error;
    }
  }

  /**
   * Skip trace through the api's internal route, which runs cost control
   * (including the lead-score gate for skip trace), stores what it finds on
   * the lead encrypted, and returns counts. A budget or score block and an
   * unavailable provider skip the step; anything else, an auth failure
   * included, propagates so the job fails visibly and BullMQ retries it.
   * (This used to call the Descope-guarded /skip-trace route with the
   * internal token, get a 401 and quietly carry on without contacts.)
   */
  private async skipTraceStep(
    accountId: string,
    leadId: string,
  ): Promise<SkipTraceResult> {
    try {
      const out = await skipTraceViaApi(accountId, leadId);
      return {
        status: out.status,
        ...(out.reason ? { reason: out.reason } : {}),
        costUsd: out.costUsd ?? 0,
        phoneFound: out.phonesFound > 0,
        emailFound: out.emailsFound > 0,
      };
    } catch (error) {
      if (error instanceof CostBlockedError) {
        console.warn(
          `[lead-enrichment] skip trace skipped: ${error.reason} (cost control)`,
        );
        return { status: 'blocked', reason: error.reason, costUsd: 0, phoneFound: false, emailFound: false };
      }
      if (error instanceof IntegrationUnavailableError) {
        console.warn(
          `[lead-enrichment] skip trace skipped: ${error.reason} (${error.message})`,
        );
        return { status: 'unavailable', reason: error.reason, costUsd: 0, phoneFound: false, emailFound: false };
      }
      throw error;
    }
  }
}
