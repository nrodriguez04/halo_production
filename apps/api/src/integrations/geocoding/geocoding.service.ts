import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import * as crypto from 'crypto';

interface GeocodingResponse {
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
  status: string;
}

@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly apiKey = process.env.GOOGLE_GEOCODING_API_KEY || '';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
  ) {}

  async geocode(address: string, city?: string, state?: string, zip?: string) {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    const query = [address, city, state, zip].filter(Boolean).join(', ');
    const cacheKey = this.generateCacheKey(query);
    
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const params = new URLSearchParams({
        address: query,
        key: this.apiKey,
      });

      const response = await fetch(`${url}?${params.toString()}`);
      
      if (!response.ok) {
        throw new Error(`Geocoding API error: ${response.status}`);
      }

      const data = await response.json() as GeocodingResponse;

      if (data.status !== 'OK') {
        throw new Error(`Geocoding failed: ${data.status}`);
      }

      // Store source record
      const sourceRecord = await this.storeSourceRecord(
        'google',
        url,
        { address: query },
        data,
      );

      // Cache response
      await this.cacheResponse(cacheKey, data);

      return {
        data,
        sourceRecordId: sourceRecord.id,
      };
    } catch (error) {
      this.logger.error(`Geocoding failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async reverseGeocode(lat: number, lng: number) {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    const cacheKey = `reverse:${lat},${lng}`;
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = 'https://maps.googleapis.com/maps/api/geocode/json';
      const params = new URLSearchParams({
        latlng: `${lat},${lng}`,
        key: this.apiKey,
      });

      const response = await fetch(`${url}?${params.toString()}`);
      const data = await response.json() as GeocodingResponse;

      if (data.status !== 'OK') {
        throw new Error(`Reverse geocoding failed: ${data.status}`);
      }

      const sourceRecord = await this.storeSourceRecord(
        'google',
        url,
        { lat, lng },
        data,
      );

      await this.cacheResponse(cacheKey, data);

      return {
        data,
        sourceRecordId: sourceRecord.id,
      };
    } catch (error) {
      this.logger.error(`Reverse geocoding failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async storeSourceRecord(
    provider: string,
    endpoint: string,
    request: Record<string, any>,
    response: any,
  ) {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(request))
      .digest('hex');

    return this.prisma.sourceRecord.create({
      data: {
        provider,
        endpoint,
        requestHash,
        response: response as any,
        trustWeight: 0.9, // Google is highly trusted
      },
    });
  }

  private generateCacheKey(...parts: (string | number | undefined)[]): string {
    return crypto
      .createHash('sha256')
      .update(parts.filter(Boolean).join('|'))
      .digest('hex');
  }

  private async getCachedResponse(key: string): Promise<any | null> {
    const recent = await this.prisma.sourceRecord.findFirst({
      where: {
        provider: 'google',
        requestHash: key,
        createdAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return recent ? recent.response : null;
  }

  private async cacheResponse(key: string, data: any): Promise<void> {
    // In production, store in Redis
  }
}

