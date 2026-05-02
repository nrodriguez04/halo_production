import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as crypto from 'crypto';
import { prisma } from '../prisma-client';

@Processor('lead-enrichment')
export class LeadEnrichmentProcessor extends WorkerHost {
  async process(job: Job<any>) {
    const { leadId } = job.data;

    try {
      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
      });

      if (!lead) {
        throw new Error(`Lead ${leadId} not found`);
      }

      const controlPlane = await prisma.controlPlane.findFirst();
      if (controlPlane && !controlPlane.enabled) {
        console.warn(`Kill switch active — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'kill_switch_active' };
      }
      if (controlPlane && !controlPlane.externalDataEnabled) {
        console.warn(`External data disabled — skipping enrichment for lead ${leadId}`);
        return { success: false, leadId, reason: 'external_data_disabled' };
      }

      const geocodeResult = await this.geocodeAddress(
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

      const attomResult = await this.lookupAttom(
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

      const updateData: Record<string, any> = { status: 'enriched' };

      // PropertyRadar skip tracing for phone/email append
      const prResult = await this.skipTracePropertyRadar(
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

      if (prResult.sourceRecordId) {
        await prisma.sourceRecord.update({
          where: { id: prResult.sourceRecordId },
          data: { leadId },
        });
      }

      if (prResult.phone && !lead.canonicalPhone) {
        updateData.canonicalPhone = prResult.phone;
      }
      if (prResult.email && !lead.canonicalEmail) {
        updateData.canonicalEmail = prResult.email;
      }

      await prisma.lead.update({
        where: { id: leadId },
        data: updateData,
      });

      return { success: true, leadId };
    } catch (error) {
      console.error(`Lead enrichment failed for ${leadId}:`, error);
      throw error;
    }
  }

  private async geocodeAddress(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ) {
    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const url = 'https://maps.googleapis.com/maps/api/geocode/json';
    const params = new URLSearchParams({
      address: query,
      key: process.env.GOOGLE_GEOCODING_API_KEY || '',
    });

    const response = await fetch(`${url}?${params.toString()}`);
    const data = await response.json();

    const requestHash = crypto.createHash('sha256').update(query).digest('hex');
    const sourceRecord = await prisma.sourceRecord.create({
      data: {
        provider: 'google',
        endpoint: url,
        requestHash,
        response: data as any,
        trustWeight: 0.9,
        leadId,
      },
    });

    return { sourceRecordId: sourceRecord.id };
  }

  private async lookupAttom(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ) {
    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const url = `${process.env.ATTOM_BASE_URL || 'https://api.gateway.attomdata.com'}/propertyapi/v1.0.0/property/expandedprofile`;

    const response = await fetch(`${url}?address=${encodeURIComponent(query)}`, {
      headers: {
        apikey: process.env.ATTOM_API_KEY || '',
        Accept: 'application/json',
      },
    });

    const data = await response.json();

    const requestHash = crypto.createHash('sha256').update(query).digest('hex');
    const sourceRecord = await prisma.sourceRecord.create({
      data: {
        provider: 'attom',
        endpoint: url,
        requestHash,
        response: data as any,
        trustWeight: 1.0,
        leadId,
      },
    });

    return { sourceRecordId: sourceRecord.id };
  }

  /**
   * PropertyRadar skip-trace: search by address then append contacts (phones + emails).
   * Returns the best phone and email found, plus the source record ID for attribution.
   */
  private async skipTracePropertyRadar(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    leadId: string,
  ): Promise<{
    sourceRecordId: string | null;
    phone: string | null;
    email: string | null;
  }> {
    const apiKey = process.env.PROPERTYRADAR_API_KEY;
    const baseUrl =
      process.env.PROPERTYRADAR_BASE_URL || 'https://api.propertyradar.com/v1';

    if (!apiKey) {
      return { sourceRecordId: null, phone: null, email: null };
    }

    try {
      const importPayload = {
        Records: [{ Address: address, City: city, State: state, Zip: zip }],
      };

      const importRes = await fetch(`${baseUrl}/import`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(importPayload),
      });

      if (!importRes.ok) {
        console.warn(`PropertyRadar import failed: ${importRes.status}`);
        return { sourceRecordId: null, phone: null, email: null };
      }

      const importData = await importRes.json();
      const radarId = importData?.Results?.[0]?.RadarID;
      if (!radarId) {
        return { sourceRecordId: null, phone: null, email: null };
      }

      const contactRes = await fetch(
        `${baseUrl}/properties/${radarId}/contacts`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
          },
        },
      );

      if (!contactRes.ok) {
        console.warn(`PropertyRadar contacts failed: ${contactRes.status}`);
        return { sourceRecordId: null, phone: null, email: null };
      }

      const contactData = await contactRes.json();

      const requestHash = crypto
        .createHash('sha256')
        .update(`skip:${address}:${city}:${state}:${zip}`)
        .digest('hex');

      const sourceRecord = await prisma.sourceRecord.create({
        data: {
          provider: 'propertyradar',
          endpoint: `/properties/${radarId}/contacts`,
          requestHash,
          response: contactData as any,
          trustWeight: 0.95,
          leadId,
        },
      });

      const bestPhone = contactData?.Phones?.sort(
        (a: any, b: any) => (b.Score || 0) - (a.Score || 0),
      )?.[0]?.Number || null;

      const bestEmail = contactData?.Emails?.sort(
        (a: any, b: any) => (b.Score || 0) - (a.Score || 0),
      )?.[0]?.Address || null;

      return {
        sourceRecordId: sourceRecord.id,
        phone: bestPhone,
        email: bestEmail,
      };
    } catch (err) {
      console.warn('PropertyRadar skip-trace error:', err);
      return { sourceRecordId: null, phone: null, email: null };
    }
  }
}
