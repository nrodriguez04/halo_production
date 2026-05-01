import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { ApiCostService } from '../../api-cost/api-cost.service';
import * as crypto from 'crypto';

export interface PropertyRadarSearchCriteria {
  County?: string[];
  State?: string[];
  City?: string[];
  Zip?: string[];
  PropertyType?: string[];
  OwnerType?: string[];
  EquityPercent?: { Min?: number; Max?: number };
  EstimatedValue?: { Min?: number; Max?: number };
  YearsOwned?: { Min?: number; Max?: number };
  Foreclosure?: boolean;
  Lien?: boolean;
  Vacant?: boolean;
  Absentee?: boolean;
  [key: string]: any;
}

export interface PropertyRadarRecord {
  RadarID: string;
  Address?: string;
  City?: string;
  State?: string;
  Zip?: string;
  County?: string;
  APN?: string;
  OwnerName?: string;
  PropertyType?: string;
  Beds?: number;
  Baths?: number;
  SqFt?: number;
  LotSqFt?: number;
  YearBuilt?: number;
  EstimatedValue?: number;
  EstimatedEquity?: number;
  EquityPercent?: number;
  LastSaleDate?: string;
  LastSaleAmount?: number;
  [key: string]: any;
}

export interface SkipTraceResult {
  RadarID: string;
  Phones?: Array<{ Number: string; Type: string; Score: number }>;
  Emails?: Array<{ Address: string; Score: number }>;
}

@Injectable()
export class PropertyRadarService {
  private readonly logger = new Logger(PropertyRadarService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private apiCostService: ApiCostService,
  ) {
    this.baseUrl =
      process.env.PROPERTYRADAR_BASE_URL || 'https://api.propertyradar.com/v1';
    this.apiKey = process.env.PROPERTYRADAR_API_KEY || '';
  }

  async searchProperties(
    criteria: PropertyRadarSearchCriteria,
    opts?: { limit?: number; start?: number },
  ): Promise<{ data: PropertyRadarRecord[]; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(JSON.stringify(criteria));
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = {};
    if (opts?.limit) params.Limit = String(opts.limit);
    if (opts?.start) params.Start = String(opts.start);

    const body = { Criteria: criteria };

    const data = await this.request<PropertyRadarRecord[]>(
      'POST',
      '/properties',
      body,
      params,
    );

    const sourceRecord = await this.storeSourceRecord(
      '/properties',
      { criteria, opts },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async getPropertyDetails(
    radarId: string,
  ): Promise<{ data: PropertyRadarRecord; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(`detail:${radarId}`);
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const data = await this.request<PropertyRadarRecord>(
      'GET',
      `/properties/${radarId}`,
    );

    const sourceRecord = await this.storeSourceRecord(
      `/properties/${radarId}`,
      { radarId },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async getOwnerDetails(
    radarId: string,
  ): Promise<{ data: any; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(`owner:${radarId}`);
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const data = await this.request<any>(
      'GET',
      `/properties/${radarId}/owner`,
    );

    const sourceRecord = await this.storeSourceRecord(
      `/properties/${radarId}/owner`,
      { radarId },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async appendContacts(
    radarId: string,
  ): Promise<{ data: SkipTraceResult; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(`skip:${radarId}`);
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const data = await this.request<SkipTraceResult>(
      'GET',
      `/properties/${radarId}/contacts`,
    );

    const sourceRecord = await this.storeSourceRecord(
      `/properties/${radarId}/contacts`,
      { radarId },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async getTransactionHistory(
    radarId: string,
  ): Promise<{ data: any[]; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(`txn:${radarId}`);
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const data = await this.request<any[]>(
      'GET',
      `/properties/${radarId}/transactions`,
    );

    const sourceRecord = await this.storeSourceRecord(
      `/properties/${radarId}/transactions`,
      { radarId },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async getComparables(
    radarId: string,
    opts?: { radius?: number; limit?: number },
  ): Promise<{ data: PropertyRadarRecord[]; sourceRecordId: string }> {
    await this.ensureEnabled();

    const cacheKey = this.hash(`comps:${radarId}:${JSON.stringify(opts)}`);
    const cached = await this.getCached('propertyradar', cacheKey);
    if (cached) return cached;

    const params: Record<string, string> = {};
    if (opts?.radius) params.Radius = String(opts.radius);
    if (opts?.limit) params.Limit = String(opts.limit);

    const data = await this.request<PropertyRadarRecord[]>(
      'GET',
      `/properties/${radarId}/comparables`,
      undefined,
      params,
    );

    const sourceRecord = await this.storeSourceRecord(
      `/properties/${radarId}/comparables`,
      { radarId, opts },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  async importRecords(
    records: Array<{ Address: string; City?: string; State?: string; Zip?: string }>,
  ): Promise<{ data: any; sourceRecordId: string }> {
    await this.ensureEnabled();

    const data = await this.request<any>('POST', '/import', { Records: records });

    const sourceRecord = await this.storeSourceRecord(
      '/import',
      { recordCount: records.length },
      data,
    );

    return { data, sourceRecordId: sourceRecord.id };
  }

  // ---- internal helpers ----

  private async ensureEnabled() {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }
    if (!this.apiKey) {
      throw new Error('PROPERTYRADAR_API_KEY is not configured');
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: any,
    params?: Record<string, string>,
    retries = 3,
  ): Promise<T> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        let url = `${this.baseUrl}${path}`;
        if (params && Object.keys(params).length) {
          url += '?' + new URLSearchParams(params).toString();
        }

        const init: RequestInit = {
          method,
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        };

        if (body && method !== 'GET') {
          init.body = JSON.stringify(body);
        }

        const res = await fetch(url, init);

        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(
              `PropertyRadar ${res.status} on ${path}, retrying in ${delay}ms`,
            );
            await this.sleep(delay);
            continue;
          }
          throw new Error(
            `PropertyRadar API error: ${res.status} ${res.statusText}`,
          );
        }

        await this.apiCostService.log({
          accountId: 'system',
          provider: 'propertyradar',
          endpoint: url,
          costUsd: 0.02,
          responseCode: res.status,
        });

        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries - 1) throw err;
        await this.sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('PropertyRadar request exhausted retries');
  }

  private async storeSourceRecord(
    endpoint: string,
    request: Record<string, any>,
    response: any,
  ) {
    const requestHash = this.hash(JSON.stringify(request));
    return this.prisma.sourceRecord.create({
      data: {
        provider: 'propertyradar',
        endpoint,
        requestHash,
        response: response as any,
        trustWeight: 0.95,
      },
    });
  }

  private hash(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
  }

  private async getCached(
    provider: string,
    key: string,
  ): Promise<any | null> {
    const recent = await this.prisma.sourceRecord.findFirst({
      where: {
        provider,
        requestHash: key,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    });

    return recent ? { data: recent.response, sourceRecordId: recent.id } : null;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
