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
// whole job, matching the old hard-cap short-circuit. PropertyRadar lives
// behind the SkipTraceService adapter and is disabled by default.

interface ContactResult {
  phone: string | null;
  email: string | null;
}

interface EnrichmentStepResult {
  sourceRecordId: string | null;
  cost: number;
}

type SkipTraceResult = ContactResult & { costUsd: number };

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
      let contacts = progress.skipTrace;
      if (!contacts) {
        contacts = await this.skipTraceViaApi(
          accountId,
          leadId,
          address,
          city,
          state,
          zip,
        );
        if (this.shouldPersistSkipTrace(contacts)) {
          progress.skipTrace = contacts;
          await this.persistProgress(enrichmentJob.id, 'skip_trace', progress);
        }
      }

      const finalized = await this.completeEnrichment({
        leadId,
        accountId,
        enrichmentJobId: enrichmentJob.id,
        contacts,
        totalCostUsd:
          (geocodeResult.cost ?? 0) + (attomResult.cost ?? 0) + (contacts.costUsd ?? 0),
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
    contacts: ContactResult & { costUsd: number };
    totalCostUsd: number;
    progress: LeadEnrichmentProgress;
  }): Promise<boolean> {
    return prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findFirst({
        where: { id: params.leadId, accountId: params.accountId },
        select: {
          status: true,
          canonicalPhone: true,
          canonicalEmail: true,
        },
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

      const additionalUpdate: Record<string, unknown> = {};
      if (params.contacts.phone && !lead.canonicalPhone) {
        additionalUpdate.canonicalPhone = params.contacts.phone;
      }
      if (params.contacts.email && !lead.canonicalEmail) {
        additionalUpdate.canonicalEmail = params.contacts.email;
      }

      const updated = await tx.lead.updateMany({
        where: {
          id: params.leadId,
          accountId: params.accountId,
          status: current,
        },
        data: { status: 'enriched', ...additionalUpdate },
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

  private readStoredSkipTrace(value: unknown): SkipTraceResult | null {
    if (!value || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    const raw = value as Record<string, unknown>;
    return {
      phone: typeof raw.phone === 'string' ? raw.phone : null,
      email: typeof raw.email === 'string' ? raw.email : null,
      costUsd: typeof raw.costUsd === 'number' ? raw.costUsd : 0,
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
    return Boolean(result.phone || result.email || result.costUsd > 0);
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
   * Calls the api's `/skip-trace/append-contacts` endpoint with a service
   * token so the cost-control decision tree (rate limit, lead score,
   * manual approval) runs before any paid skip-trace call. The api also
   * writes the unified IntegrationCostEvent row for the call.
   *
   * If the api isn't reachable or no token is configured, returns empty
   * contacts and continues — skip-trace is best-effort.
   */
  private async skipTraceViaApi(
    accountId: string,
    leadId: string,
    propertyAddress: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
  ): Promise<SkipTraceResult> {
    const apiBase = process.env.INTERNAL_API_BASE_URL;
    const token = process.env.INTERNAL_API_TOKEN;
    if (!apiBase || !token) {
      // Skip trace stays best-effort: log and return empty so the rest of
      // enrichment continues.
      console.warn(
        '[lead-enrichment] INTERNAL_API_BASE_URL / INTERNAL_API_TOKEN not configured; skipping skip-trace step',
      );
      return { phone: null, email: null, costUsd: 0 };
    }

    try {
      const res = await fetch(`${apiBase}/skip-trace/append-contacts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          leadId,
          propertyAddress,
          city,
          state,
          zip,
        }),
      });
      if (!res.ok) {
        console.warn(`[lead-enrichment] skip-trace returned ${res.status}`);
        return { phone: null, email: null, costUsd: 0 };
      }
      const result = (await res.json()) as {
        provider: string;
        status: string;
        phones: { number: string }[];
        emails: { email: string }[];
        costUsd?: number;
      };
      const phone = result.phones[0]?.number ?? null;
      const email = result.emails[0]?.email ?? null;
      return { phone, email, costUsd: result.costUsd ?? 0 };
    } catch (err) {
      console.warn('[lead-enrichment] skip-trace call failed:', err);
      // We deliberately swallow — accountId is the unused-vars dodge
      void accountId;
      return { phone: null, email: null, costUsd: 0 };
    }
  }
}
