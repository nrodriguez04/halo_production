import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { IntegrationCostControlService } from '../../cost-control/cost-control.service';
import type { CostContext } from '../../cost-control/dto/cost-intent.dto';

export interface RentCastListing {
  id: string;
  formattedAddress: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  price: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  listingType: string;
  status: string;
  listedDate: string;
  mlsNumber?: string;
}

export interface RentCastPropertyRecord {
  id: string;
  formattedAddress: string;
  city: string;
  state: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  squareFootage: number;
  yearBuilt: number;
  assessedValue: number;
  estimatedValue: number;
}

export interface RentCastValueEstimate {
  price: number;
  priceRangeLow: number;
  priceRangeHigh: number;
}

@Injectable()
export class RentCastService {
  private readonly logger = new Logger(RentCastService.name);
  private readonly baseUrl = 'https://api.rentcast.io/v1';
  private readonly apiKey = process.env.RENTCAST_API_KEY || '';

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private costControl: IntegrationCostControlService,
  ) {}

  async getListings(city: string, state: string, ctx: CostContext): Promise<RentCastListing[]> {
    if (!(await this.controlPlane.isExternalDataEnabled())) {
      this.logger.warn('External data disabled by control plane');
      return [];
    }
    if (!this.apiKey) {
      this.logger.warn('RENTCAST_API_KEY not configured');
      return [];
    }

    const out = await this.costControl.checkAndCall<{ city: string; state: string }, RentCastListing[]>({
      provider: 'rentcast',
      action: 'listings',
      payload: { city, state },
      context: ctx,
      execute: async () => {
        const params = new URLSearchParams({ city, state, status: 'Active', limit: '50' });
        const res = await fetch(`${this.baseUrl}/listings/sale?${params}`, {
          headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
        });
        if (!res.ok) {
          this.logger.error(`RentCast listings API error: ${res.status} ${res.statusText}`);
          return [];
        }
        return (await res.json()) as RentCastListing[];
      },
    });
    return (out.result as RentCastListing[] | null) ?? [];
  }

  async getPropertyRecord(address: string, ctx: CostContext): Promise<RentCastPropertyRecord | null> {
    if (!(await this.controlPlane.isExternalDataEnabled()) || !this.apiKey) return null;

    const out = await this.costControl.checkAndCall<{ address: string }, RentCastPropertyRecord | null>({
      provider: 'rentcast',
      action: 'property',
      payload: { address },
      context: ctx,
      execute: async () => {
        const params = new URLSearchParams({ address });
        const res = await fetch(`${this.baseUrl}/properties?${params}`, {
          headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json();
        return Array.isArray(data) ? (data[0] ?? null) : data;
      },
    });
    return (out.result as RentCastPropertyRecord | null) ?? null;
  }

  async getValueEstimate(
    address: string,
    ctx: CostContext,
  ): Promise<RentCastValueEstimate | null> {
    // Previously skipped the external-data gate; now enforced uniformly.
    if (!(await this.controlPlane.isExternalDataEnabled()) || !this.apiKey) return null;

    const out = await this.costControl.checkAndCall<{ address: string }, RentCastValueEstimate | null>({
      provider: 'rentcast',
      action: 'value_estimate',
      payload: { address },
      context: ctx,
      execute: async () => {
        const params = new URLSearchParams({ address });
        const res = await fetch(`${this.baseUrl}/avm/value?${params}`, {
          headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
        });
        if (!res.ok) return null;
        return (await res.json()) as RentCastValueEstimate;
      },
    });
    return (out.result as RentCastValueEstimate | null) ?? null;
  }
}
