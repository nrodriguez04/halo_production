import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { PropertyCreate } from '@halo/shared';
import * as reconciliationUtils from '@halo/shared';

@Injectable()
export class PropertiesService {
  constructor(private prisma: PrismaService) {}

  async create(data: PropertyCreate) {
    return this.prisma.property.create({
      data,
      include: {
        sourceRecords: true,
      },
    });
  }

  async findOne(id: string, accountId: string) {
    const property = await this.prisma.property.findFirst({
      where: { id, accountId },
      include: {
        sourceRecords: {
          orderBy: { createdAt: 'desc' },
        },
        deals: true,
      },
    });

    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return property;
  }

  async reconcile(propertyId: string, accountId: string) {
    const property = await this.findOne(propertyId, accountId);
    const sourceRecords = property.sourceRecords || [];

    // Group fields by name from source records
    const sourceData: Record<string, any[]> = {};

    for (const record of sourceRecords) {
      const response = record.response as Record<string, any>;
      const provider = record.provider;
      const trustWeight = record.trustWeight;
      const freshness = this.calculateFreshness(record.createdAt);

      // Extract fields from response (structure depends on provider)
      for (const [key, value] of Object.entries(response)) {
        if (!sourceData[key]) {
          sourceData[key] = [];
        }
        sourceData[key].push({
          value,
          source: provider,
          trustWeight,
          freshness,
        });
      }
    }

    // Reconcile each field
    const reconciled = reconciliationUtils.reconcileProperty(sourceData);

    // Update property with reconciled data
    return this.prisma.property.update({
      where: { id: propertyId },
      data: {
        confidence: reconciled.confidence,
        // Update canonical fields from reconciled data
        address: reconciled.canonical.address || property.address,
        city: reconciled.canonical.city || property.city,
        state: reconciled.canonical.state || property.state,
        zip: reconciled.canonical.zip || property.zip,
      },
    });
  }

  async getMapPins(accountId: string, filters: { city?: string; state?: string; bbox?: string }) {
    const where: any = { accountId };
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.state) where.state = filters.state;

    const properties = await this.prisma.property.findMany({
      where,
      select: {
        id: true,
        address: true,
        city: true,
        state: true,
        latitude: true,
        longitude: true,
        estimatedValue: true,
        confidence: true,
      },
      take: 500,
    });

    return properties.map((p) => ({
      id: p.id,
      latitude: p.latitude ?? 0,
      longitude: p.longitude ?? 0,
      address: p.address,
      city: p.city,
      state: p.state,
      estimatedValue: p.estimatedValue ?? undefined,
    }));
  }

  async search(
    accountId: string,
    filters: { city?: string; state?: string; minPrice?: number; maxPrice?: number },
  ) {
    const where: any = { accountId };
    if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
    if (filters.state) where.state = filters.state;

    return this.prisma.property.findMany({
      where,
      include: { deals: { select: { id: true, stage: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private calculateFreshness(createdAt: Date): number {
    const daysSince = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
    // Freshness decays linearly: 1.0 for today, 0.5 for 30 days ago, 0.0 for 60+ days
    return Math.max(0, 1 - daysSince / 60);
  }
}

