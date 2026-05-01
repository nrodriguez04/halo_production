import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import { ApiCostService } from '../../api-cost/api-cost.service';

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

@Injectable()
export class RentCastService {
  private readonly logger = new Logger(RentCastService.name);
  private readonly baseUrl = 'https://api.rentcast.io/v1';
  private readonly apiKey = process.env.RENTCAST_API_KEY || '';
  private readonly cacheHours = 24;

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private apiCostService: ApiCostService,
  ) {}

  async getListings(city: string, state: string): Promise<RentCastListing[]> {
    const isEnabled = await this.controlPlane.isExternalDataEnabled();
    if (!isEnabled) {
      this.logger.warn('External data disabled by control plane');
      return [];
    }

    if (!this.apiKey) {
      this.logger.warn('RENTCAST_API_KEY not configured');
      return [];
    }

    const cacheKey = `rentcast:listings:${city}:${state}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached as RentCastListing[];

    try {
      const params = new URLSearchParams({ city, state, status: 'Active', limit: '50' });
      const res = await fetch(`${this.baseUrl}/listings/sale?${params}`, {
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      });

      if (!res.ok) {
        this.logger.error(`RentCast API error: ${res.status} ${res.statusText}`);
        return [];
      }

      await this.apiCostService.log({
        accountId: 'system',
        provider: 'rentcast',
        endpoint: `${this.baseUrl}/listings/sale?${params}`,
        costUsd: 0.05,
        responseCode: res.status,
      });

      const data = await res.json();
      await this.setCache(cacheKey, data, 'rentcast', 'listings/sale');
      return data;
    } catch (error) {
      this.logger.error('RentCast listings fetch failed', error);
      return [];
    }
  }

  async getPropertyRecord(address: string): Promise<RentCastPropertyRecord | null> {
    const isEnabled = await this.controlPlane.isExternalDataEnabled();
    if (!isEnabled || !this.apiKey) return null;

    const cacheKey = `rentcast:property:${address}`;
    const cached = await this.getCache(cacheKey);
    if (cached) return cached as RentCastPropertyRecord;

    try {
      const params = new URLSearchParams({ address });
      const res = await fetch(`${this.baseUrl}/properties?${params}`, {
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      });

      if (!res.ok) return null;

      await this.apiCostService.log({
        accountId: 'system',
        provider: 'rentcast',
        endpoint: `${this.baseUrl}/properties?${params}`,
        costUsd: 0.05,
        responseCode: res.status,
      });

      const data = await res.json();
      const record = Array.isArray(data) ? data[0] : data;
      if (record) await this.setCache(cacheKey, record, 'rentcast', 'properties');
      return record || null;
    } catch (error) {
      this.logger.error('RentCast property fetch failed', error);
      return null;
    }
  }

  async getValueEstimate(address: string): Promise<{ price: number; priceRangeLow: number; priceRangeHigh: number } | null> {
    if (!this.apiKey) return null;

    try {
      const params = new URLSearchParams({ address });
      const res = await fetch(`${this.baseUrl}/avm/value?${params}`, {
        headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      });

      if (!res.ok) return null;

      await this.apiCostService.log({
        accountId: 'system',
        provider: 'rentcast',
        endpoint: `${this.baseUrl}/avm/value?${params}`,
        costUsd: 0.05,
        responseCode: res.status,
      });

      return await res.json();
    } catch (error) {
      this.logger.error('RentCast value estimate failed', error);
      return null;
    }
  }

  private async getCache(cacheKey: string): Promise<any | null> {
    const cutoff = new Date(Date.now() - this.cacheHours * 60 * 60 * 1000);
    const record = await this.prisma.sourceRecord.findFirst({
      where: {
        provider: 'rentcast',
        requestHash: cacheKey,
        createdAt: { gte: cutoff },
      },
      orderBy: { createdAt: 'desc' },
    });
    return record?.response || null;
  }

  private async setCache(cacheKey: string, data: any, provider: string, endpoint: string) {
    await this.prisma.sourceRecord.create({
      data: {
        provider,
        endpoint,
        requestHash: cacheKey,
        response: data,
      },
    });
  }
}
