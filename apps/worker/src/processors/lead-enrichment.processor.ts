import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { LeadStatus, transitionLeadStatus } from '@halo/shared';
import { prisma } from '../prisma-client';
import { isOverHardCap, recordWorkerCost } from '../cost-ledger';

// Lead enrichment processor. Performs the staged enrichment funnel:
//   1. Geocode the lead address (Google Geocoding)
//   2. Pull property data (ATTOM)
//   3. Skip trace via the api's `/skip-trace/append-contacts` endpoint
//      (so the cost-control decision tree runs before any paid call)
//
// The worker writes best-effort cost ledger rows for steps 1 and 2 since
// those still use direct fetch from worker context. Step 3 already lands
// in `integration_cost_events` because the api side calls
// `IntegrationCostControlService.checkAndCall`. The previous duplicate
// PropertyRadar raw-fetch path has been deleted; PropertyRadar lives
// behind the SkipTraceService adapter and is disabled by default.

const ATTOM_COST_USD = 0.1;
const GEOCODE_COST_USD = 0.005;

interface ContactResult {
  phone: string | null;
  email: string | null;
}

@Processor('lead-enrichment')
export class LeadEnrichmentProcessor extends WorkerHost {
  async process(job: Job<{ leadId: string }>) {
    const { leadId } = job.data;

    try {
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error(`Lead ${leadId} not found`);

      const controlPlane = await prisma.controlPlane.findFirst();
      if (controlPlane && !controlPlane.enabled) {
        console.warn(`Kill switch active — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'kill_switch_active' };
      }
      if (controlPlane && !controlPlane.externalDataEnabled) {
        console.warn(`External data disabled — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'external_data_disabled' };
      }

      const accountId = lead.accountId;

      // Mark the lead as `enriching` via the shared state machine. The
      // worker can't talk to LeadLifecycleService directly without an
      // HTTP roundtrip, so it imports the same validator from
      // `@halo/shared` and writes through Prisma.
      await this.markStatus(leadId, accountId, lead.status, 'enriching');

      const enrichmentJob = await prisma.leadEnrichmentJob.create({
        data: { accountId, leadId, stage: 'normalizing' },
      });

      const geocodeResult = await this.geocodeAddress(
        accountId,
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

      const attomResult = await this.lookupAttom(
        accountId,
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

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
      const contacts = await this.skipTraceViaApi(
        accountId,
        leadId,
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
      );
      const additional: Record<string, unknown> = {};
      if (contacts.phone && !lead.canonicalPhone) additional.canonicalPhone = contacts.phone;
      if (contacts.email && !lead.canonicalEmail) additional.canonicalEmail = contacts.email;

      await this.markStatus(
        leadId,
        accountId,
        'enriching',
        'enriched',
        additional,
      );
      await prisma.leadEnrichmentJob.update({
        where: { id: enrichmentJob.id },
        data: {
          stage: 'completed',
          completedAt: new Date(),
          totalCostUsd:
            (geocodeResult.cost ?? 0) + (attomResult.cost ?? 0) + (contacts.costUsd ?? 0),
        },
      });

      return { success: true, leadId };
    } catch (error) {
      console.error(`Lead enrichment failed for ${leadId}:`, error);
      throw error;
    }
  }

  /**
   * Apply a status transition via the shared `@halo/shared` validator
   * and write a `lead.status.<next>` row to the timeline so the audit
   * trail matches what `LeadLifecycleService` produces on the api side.
   * Skips the update silently if the transition is illegal so a hung
   * job re-running can't corrupt the state.
   */
  private async markStatus(
    leadId: string,
    accountId: string,
    current: string,
    next: LeadStatus,
    additionalUpdate: Record<string, unknown> = {},
  ): Promise<void> {
    const result = transitionLeadStatus(current, next, {
      accountId,
      actorId: null,
      actorType: 'worker',
    });
    if (!result.allowed) {
      console.warn(
        `[lead-enrichment] illegal transition ${current} -> ${next} for lead ${leadId}: ${result.reason}`,
      );
      return;
    }
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: { status: next, ...additionalUpdate },
      }),
      prisma.timelineEvent.create({
        data: {
          tenantId: accountId,
          entityType: 'LEAD',
          entityId: leadId,
          eventType: `lead.status.${next}`,
          actorType: 'system',
          actorId: null,
          payloadJson: { from: current, to: next },
        },
      }),
    ]);
  }

  // -- enrichment steps -------------------------------------------------

  private async geocodeAddress(
    accountId: string,
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ): Promise<{ sourceRecordId: string | null; cost: number }> {
    if (await isOverHardCap(accountId, 'google_geocoding')) {
      console.warn(`Geocoding skipped: budget exceeded for ${accountId}`);
      return { sourceRecordId: null, cost: 0 };
    }
    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = new URLSearchParams({
      address: query,
      key: process.env.GOOGLE_GEOCODING_API_KEY || '',
    });
    const startedAt = Date.now();
    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();
    const durationMs = Date.now() - startedAt;

    const requestHash = crypto.createHash('sha256').update(query).digest('hex');
    const sourceRecord = await prisma.sourceRecord.create({
      data: {
        provider: 'google_geocoding',
        endpoint: url,
        requestHash,
        response: data as object,
        trustWeight: 0.9,
        leadId,
      },
    });

    await recordWorkerCost({
      accountId,
      providerKey: 'google_geocoding',
      action: 'geocode',
      costUsd: response.ok ? GEOCODE_COST_USD : 0,
      status: response.ok ? 'completed' : 'errored',
      durationMs,
      responseCode: response.status,
      leadId,
    });

    return { sourceRecordId: sourceRecord.id, cost: response.ok ? GEOCODE_COST_USD : 0 };
  }

  private async lookupAttom(
    accountId: string,
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ): Promise<{ sourceRecordId: string | null; cost: number }> {
    if (await isOverHardCap(accountId, 'attom')) {
      console.warn(`ATTOM skipped: budget exceeded for ${accountId}`);
      return { sourceRecordId: null, cost: 0 };
    }
    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const url = `${process.env.ATTOM_BASE_URL || 'https://api.gateway.attomdata.com'}/propertyapi/v1.0.0/property/expandedprofile`;

    const startedAt = Date.now();
    const response = await fetch(`${url}?address=${encodeURIComponent(query)}`, {
      headers: {
        apikey: process.env.ATTOM_API_KEY || '',
        Accept: 'application/json',
      },
    });
    const data = await response.json();
    const durationMs = Date.now() - startedAt;

    const requestHash = crypto.createHash('sha256').update(query).digest('hex');
    const sourceRecord = await prisma.sourceRecord.create({
      data: {
        provider: 'attom',
        endpoint: url,
        requestHash,
        response: data as object,
        trustWeight: 1.0,
        leadId,
      },
    });

    await recordWorkerCost({
      accountId,
      providerKey: 'attom',
      action: 'property_expanded_profile',
      costUsd: response.ok ? ATTOM_COST_USD : 0,
      status: response.ok ? 'completed' : 'errored',
      durationMs,
      responseCode: response.status,
      leadId,
    });

    return { sourceRecordId: sourceRecord.id, cost: response.ok ? ATTOM_COST_USD : 0 };
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
  ): Promise<ContactResult & { costUsd: number }> {
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
