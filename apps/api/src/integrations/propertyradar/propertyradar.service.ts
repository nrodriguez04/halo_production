import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import * as crypto from 'crypto';

// PropertyRadar adapter. The provider is registered with `enabled=false` by
// default in the seed; cost-control short-circuits with BLOCK_FEATURE_DISABLED
// when re-enabled here. All paid endpoints route through `checkAndCall` so
// they appear in the unified cost ledger and respect provider/global caps.

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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

export interface PropertyRadarSkipTraceResponse {
  RadarID: string;
  Phones?: Array<{ Number: string; Type: string; Score: number }>;
  Emails?: Array<{ Address: string; Score: number }>;
}

export interface CallResult<T> {
  data: T;
  sourceRecordId: string;
}

@Injectable()
export class PropertyRadarService {
  private readonly logger = new Logger(PropertyRadarService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
  ) {
    this.baseUrl = process.env.PROPERTYRADAR_BASE_URL || 'https://api.propertyradar.com/v1';
    this.apiKey = process.env.PROPERTYRADAR_API_KEY || '';
  }

  async searchProperties(
    criteria: PropertyRadarSearchCriteria,
    opts: { limit?: number; start?: number } | undefined,
    ctx: CostContext,
  ): Promise<CallResult<PropertyRadarRecord[]> | null> {
    return this.run('property_search', { criteria, opts }, ctx, async () => {
      const params: Record<string, string> = {};
      if (opts?.limit) params.Limit = String(opts.limit);
      if (opts?.start) params.Start = String(opts.start);
      const data = await this.request<PropertyRadarRecord[]>('POST', '/properties', { Criteria: criteria }, params);
      const sourceRecord = await this.storeSourceRecord('/properties', { criteria, opts }, data);
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  async getPropertyDetails(radarId: string, ctx: CostContext) {
    return this.run('property_lookup', { radarId }, ctx, async () => {
      const data = await this.request<PropertyRadarRecord>('GET', `/properties/${radarId}`);
      const sourceRecord = await this.storeSourceRecord(`/properties/${radarId}`, { radarId }, data);
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  async getOwnerDetails(radarId: string, ctx: CostContext) {
    return this.run('owner_details', { radarId }, ctx, async () => {
      const data = await this.request<unknown>('GET', `/properties/${radarId}/owner`);
      const sourceRecord = await this.storeSourceRecord(`/properties/${radarId}/owner`, { radarId }, data);
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  async appendContacts(radarId: string, ctx: CostContext) {
    return this.run('append_contacts', { radarId }, ctx, async () => {
      const data = await this.request<PropertyRadarSkipTraceResponse>('GET', `/properties/${radarId}/contacts`);
      const sourceRecord = await this.storeSourceRecord(
        `/properties/${radarId}/contacts`,
        { radarId },
        data,
      );
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  async getTransactionHistory(radarId: string, ctx: CostContext) {
    return this.run('transaction_history', { radarId }, ctx, async () => {
      const data = await this.request<unknown[]>('GET', `/properties/${radarId}/transactions`);
      const sourceRecord = await this.storeSourceRecord(
        `/properties/${radarId}/transactions`,
        { radarId },
        data,
      );
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  async getComparables(
    radarId: string,
    opts: { radius?: number; limit?: number } | undefined,
    ctx: CostContext,
  ) {
    return this.run('comparables', { radarId, opts }, ctx, async () => {
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
    });
  }

  async importRecords(
    records: Array<{ Address: string; City?: string; State?: string; Zip?: string }>,
    ctx: CostContext,
  ) {
    return this.run('import', { recordCount: records.length }, ctx, async () => {
      const data = await this.request<unknown>('POST', '/import', { Records: records });
      const sourceRecord = await this.storeSourceRecord('/import', { recordCount: records.length }, data);
      return { data, sourceRecordId: sourceRecord.id };
    });
  }

  // ---- internal helpers ----

  private async run<T>(
    action: string,
    payload: Record<string, unknown>,
    ctx: CostContext,
    exec: () => Promise<T>,
  ): Promise<T | null> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }
    if (!this.apiKey) {
      throw new Error('PROPERTYRADAR_API_KEY is not configured');
    }
    const out = await this.costControl.checkAndCall<Record<string, unknown>, T>({
      provider: 'propertyradar',
      action,
      payload,
      context: ctx,
      execute: exec,
    });
    return (out.result as T | null) ?? null;
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
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
        if (body && method !== 'GET') init.body = JSON.stringify(body);

        const res = await fetch(url, init);
        if (!res.ok) {
          if ((res.status === 429 || res.status >= 500) && attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`PropertyRadar ${res.status} on ${path}, retrying in ${delay}ms`);
            await sleep(delay);
            continue;
          }
          throw new Error(`PropertyRadar API error: ${res.status} ${res.statusText}`);
        }
        return (await res.json()) as T;
      } catch (err) {
        if (attempt === retries - 1) throw err;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
    throw new Error('PropertyRadar request exhausted retries');
  }

  private async storeSourceRecord(
    endpoint: string,
    request: Record<string, unknown>,
    response: unknown,
  ) {
    const requestHash = crypto.createHash('sha256').update(JSON.stringify(request)).digest('hex');
    return this.prisma.sourceRecord.create({
      data: {
        provider: 'propertyradar',
        endpoint,
        requestHash,
        response: response as object,
        trustWeight: 0.95,
      },
    });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
