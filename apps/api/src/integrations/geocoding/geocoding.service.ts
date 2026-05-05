import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import * as crypto from 'crypto';

interface GeocodingResponse {
  results: Array<{
    formatted_address: string;
    geometry: { location: { lat: number; lng: number } };
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
  }>;
  status: string;
}

export interface GeocodingResult {
  data: GeocodingResponse;
  sourceRecordId: string | null;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly apiKey = process.env.GOOGLE_GEOCODING_API_KEY || '';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
  ) {}

  async geocode(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    ctx: CostContext,
  ): Promise<GeocodingResult | null> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }
    const query = [address, city, state, zip].filter(Boolean).join(', ');

    const out = await this.costControl.checkAndCall<{ address: string }, GeocodingResult>({
      provider: 'google_geocoding',
      action: 'geocode',
      payload: { address: query },
      context: ctx,
      execute: async () => {
        const url = 'https://maps.googleapis.com/maps/api/geocode/json';
        const params = new URLSearchParams({ address: query, key: this.apiKey });
        const response = await fetch(`${url}?${params.toString()}`);
        if (!response.ok) throw new Error(`Geocoding API error: ${response.status}`);
        const data = (await response.json()) as GeocodingResponse;
        if (data.status !== 'OK') throw new Error(`Geocoding failed: ${data.status}`);
        const sourceRecord = await this.storeSourceRecord('google_geocoding', url, { address: query }, data);
        return { data, sourceRecordId: sourceRecord.id };
      },
    });
    return (out.result as GeocodingResult | null) ?? null;
  }

  async reverseGeocode(lat: number, lng: number, ctx: CostContext): Promise<GeocodingResult | null> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    const out = await this.costControl.checkAndCall<{ lat: number; lng: number }, GeocodingResult>({
      provider: 'google_geocoding',
      action: 'reverse_geocode',
      payload: { lat, lng },
      context: ctx,
      execute: async () => {
        const url = 'https://maps.googleapis.com/maps/api/geocode/json';
        const params = new URLSearchParams({ latlng: `${lat},${lng}`, key: this.apiKey });
        const response = await fetch(`${url}?${params.toString()}`);
        const data = (await response.json()) as GeocodingResponse;
        if (data.status !== 'OK') throw new Error(`Reverse geocoding failed: ${data.status}`);
        const sourceRecord = await this.storeSourceRecord('google_geocoding', url, { lat, lng }, data);
        return { data, sourceRecordId: sourceRecord.id };
      },
    });
    return (out.result as GeocodingResult | null) ?? null;
  }

  private async storeSourceRecord(
    provider: string,
    endpoint: string,
    request: Record<string, unknown>,
    response: unknown,
  ) {
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.prisma.sourceRecord.create({
      data: {
        provider,
        endpoint,
        requestHash,
        response: response as object,
        trustWeight: 0.9,
      },
    });
  }
}
