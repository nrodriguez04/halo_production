import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';
import * as crypto from 'crypto';

interface ATTOMResponse {
  property: Array<{
    identifier: { obPropId: string; fips: string; apn: string };
    address: {
      oneLine: string;
      line1: string;
      line2?: string;
      city: string;
      state: string;
      zip: string;
    };
    owner: { name: string };
    sale: { saleTransDate: string; saleTransAmount: string };
    summary: {
      propLandUse: string;
      yearBuilt: string;
      beds: number;
      baths: number;
      sqft: number;
    };
  }>;
}

export interface AttomLookupResult {
  data: ATTOMResponse;
  sourceRecordId: string | null;
}

@Injectable()
export class AttomService {
  private readonly logger = new Logger(AttomService.name);
  private readonly baseUrl = process.env.ATTOM_BASE_URL || 'https://api.gateway.attomdata.com';
  private readonly apiKey = process.env.ATTOM_API_KEY || '';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
  ) {}

  async lookupProperty(
    address: string,
    city: string | undefined,
    state: string | undefined,
    zip: string | undefined,
    ctx: CostContext,
  ): Promise<AttomLookupResult | null> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }
    const query = [address, city, state, zip].filter(Boolean).join(', ');

    const out = await this.costControl.checkAndCall<{ address: string }, AttomLookupResult>({
      provider: 'attom',
      action: 'property_expanded_profile',
      payload: { address: query },
      context: ctx,
      hints: { idempotencyKey: `attom:lookup:${this.hash(query)}` },
      execute: async () => {
        const url = `${this.baseUrl}/propertyapi/v1.0.0/property/expandedprofile`;
        const data = (await this.makeRequest(url, { address: query })) as ATTOMResponse;
        const sourceRecord = await this.storeSourceRecord('attom', url, { address: query }, data);
        return { data, sourceRecordId: sourceRecord.id };
      },
    });
    return out.fromCache ? (out.result as AttomLookupResult) : out.result ?? null;
  }

  async lookupByAPN(apn: string, ctx: CostContext): Promise<AttomLookupResult | null> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      throw new Error('External data access is disabled');
    }

    const out = await this.costControl.checkAndCall<{ apn: string }, AttomLookupResult>({
      provider: 'attom',
      action: 'property_expanded_profile',
      payload: { apn },
      context: ctx,
      hints: { idempotencyKey: `attom:apn:${apn}` },
      execute: async () => {
        const url = `${this.baseUrl}/propertyapi/v1.0.0/property/expandedprofile`;
        const data = (await this.makeRequest(url, { apn })) as ATTOMResponse;
        const sourceRecord = await this.storeSourceRecord('attom', url, { apn }, data);
        return { data, sourceRecordId: sourceRecord.id };
      },
    });
    return out.fromCache ? (out.result as AttomLookupResult) : out.result ?? null;
  }

  private async makeRequest(
    url: string,
    params: Record<string, string>,
    retries = 3,
  ): Promise<unknown> {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const queryString = new URLSearchParams(params).toString();
        const fullUrl = `${url}?${queryString}`;
        const response = await fetch(fullUrl, {
          method: 'GET',
          headers: { apikey: this.apiKey, Accept: 'application/json' },
        });

        if (!response.ok) {
          if ((response.status === 429 || response.status >= 500) && attempt < retries - 1) {
            const delay = Math.pow(2, attempt) * 1000;
            this.logger.warn(`ATTOM ${response.status}, retrying after ${delay}ms`);
            await sleep(delay);
            continue;
          }
          throw new Error(`ATTOM API error: ${response.status} ${response.statusText}`);
        }

        return await response.json();
      } catch (error) {
        if (attempt === retries - 1) throw error;
        await sleep(Math.pow(2, attempt) * 1000);
      }
    }
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
        trustWeight: 1.0,
      },
    });
  }

  private hash(input: string): string {
    return crypto.createHash('sha1').update(input).digest('hex').slice(0, 16);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
