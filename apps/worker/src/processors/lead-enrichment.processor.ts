import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

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

      // Geocode address (simplified - in production, use shared service)
      const geocodeResult = await this.geocodeAddress(
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

      // Lookup property data from ATTOM (simplified)
      const attomResult = await this.lookupAttom(
        lead.canonicalAddress || '',
        lead.canonicalCity || undefined,
        lead.canonicalState || undefined,
        lead.canonicalZip || undefined,
        leadId,
      );

      // Link source records to lead
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

      // Update lead status
      await prisma.lead.update({
        where: { id: leadId },
        data: { status: 'enriched' },
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
    // Simplified geocoding - in production, use shared service
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
    // Simplified ATTOM lookup - in production, use shared service
    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const url = `${process.env.ATTOM_BASE_URL || 'https://api.gateway.attomdata.com'}/propertyapi/v1.0.0/property/expandedprofile`;
    
    const response = await fetch(`${url}?address=${encodeURIComponent(query)}`, {
      headers: {
        'apikey': process.env.ATTOM_API_KEY || '',
        'Accept': 'application/json',
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
}

