import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { ApiCostService } from '../../api-cost/api-cost.service';
import * as crypto from 'crypto';

interface ATTOMResponse {
  property: Array<{
    identifier: {
      obPropId: string;
      fips: string;
      apn: string;
    };
    address: {
      oneLine: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
    };
    owner: {
      name: string;
    };
    sale: {
      saleTransDate: string;
      saleTransAmount: string;
    };
    summary: {
      propLandUse: string;
      yearBuilt: string;
      beds: number;
      baths: number;
      sqft: number;
    };
  }>;
}

@Injectable()
export class AttomService {
  private readonly logger = new Logger(AttomService.name);
  private readonly baseUrl = process.env.ATTOM_BASE_URL || 'https://api.gateway.attomdata.com';
  private readonly apiKey = process.env.ATTOM_API_KEY || '';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private apiCostService: ApiCostService,
  ) {}

  async lookupProperty(address: string, city?: string, state?: string, zip?: string) {
    // Check control plane
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    // Check cache first
    const cacheKey = this.generateCacheKey(address, city, state, zip);
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Build query
      const query = [address, city, state, zip].filter(Boolean).join(', ');
      const url = `${this.baseUrl}/propertyapi/v1.0.0/property/expandedprofile`;

      const response = await this.makeRequest(url, {
        address: query,
      });

      await this.apiCostService.log({
        accountId: 'system',
        provider: 'attom',
        endpoint: `${url}?${new URLSearchParams({ address: query }).toString()}`,
        costUsd: 0.1,
        responseCode: 200,
      });

      const data = response as ATTOMResponse;

      // Store source record
      const sourceRecord = await this.storeSourceRecord(
        'attom',
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
      this.logger.error(`ATTOM lookup failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async lookupByAPN(apn: string) {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    const cacheKey = `apn:${apn}`;
    const cached = await this.getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const url = `${this.baseUrl}/propertyapi/v1.0.0/property/expandedprofile`;
      const response = await this.makeRequest(url, { apn });

      await this.apiCostService.log({
        accountId: 'system',
        provider: 'attom',
        endpoint: `${url}?${new URLSearchParams({ apn }).toString()}`,
        costUsd: 0.1,
        responseCode: 200,
      });

      const data = response as ATTOMResponse;

      const sourceRecord = await this.storeSourceRecord(
        'attom',
        url,
        { apn },
        data,
      );

      await this.cacheResponse(cacheKey, data);

      return {
        data,
        sourceRecordId: sourceRecord.id,
      };
    } catch (error) {
      this.logger.error(`ATTOM APN lookup failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  private async makeRequest(url: string, params: Record<string, any>, retries = 3): Promise<any> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${url}?${queryString}`;

        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: {
            'apikey': this.apiKey,
            'Accept': 'application/json',
          },
        });

        if (!response.ok) {
          if (response.status === 429 && attempt < retries - 1) {
            // Rate limited - exponential backoff
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`Rate limited, retrying after ${delay}ms`);
            await this.sleep(delay);
            continue;
          }

          if (response.status >= 500 && attempt < retries - 1) {
            // Server error - exponential backoff
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`Server error ${response.status}, retrying after ${delay}ms`);
            await this.sleep(delay);
            continue;
          }

          throw new Error(`ATTOM API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === retries - 1) {
          throw error;
        }
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
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
        trustWeight: 1.0, // ATTOM is trusted source
      },
    });
  }

  private generateCacheKey(...parts: (string | undefined)[]): string {
    return crypto
      .createHash('sha256')
      .update(parts.filter(Boolean).join('|'))
      .digest('hex');
  }

  private async getCachedResponse(key: string): Promise<any | null> {
    // In production, use Redis for caching
    // For now, check if we have a recent source record
    const recent = await this.prisma.sourceRecord.findFirst({
      where: {
        provider: 'attom',
        requestHash: key,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return recent ? recent.response : null;
  }

  private async cacheResponse(key: string, data: any): Promise<void> {
    // In production, store in Redis
    // For now, rely on source records
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

