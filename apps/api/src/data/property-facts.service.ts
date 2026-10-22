import { Injectable } from '@nestjs/common';
import { toJurisdictionCode, type NormalizedProperty } from '@halo/shared';
import { PrismaService } from '../prisma.service';

/**
 * Property facts from any provider, written onto the lead's Property row
 * (docs/data-pipeline.md s2). Enrichment used to keep provider data only
 * as source records, so a deal made from a lead had no property and could
 * not be underwritten. Values a provider does not report never erase what
 * is already known.
 */
@Injectable()
export class PropertyFactsService {
  constructor(private prisma: PrismaService) {}

  async applyToLead(
    accountId: string,
    leadId: string,
    facts: NormalizedProperty,
    sourceRecordId?: string | null,
  ): Promise<string | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, accountId },
      select: {
        id: true,
        canonicalAddress: true,
        canonicalCity: true,
        canonicalState: true,
        canonicalZip: true,
        properties: {
          select: { id: true },
          take: 1,
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!lead) return null;
    const address = facts.address ?? lead.canonicalAddress;
    const city = facts.city ?? lead.canonicalCity;
    const state = toJurisdictionCode(facts.state ?? lead.canonicalState);
    const zip = (facts.zip ?? lead.canonicalZip)?.slice(0, 5) ?? null;

    const known = <T>(v: T | null | undefined) =>
      v === null || v === undefined ? undefined : v;
    const data = {
      apn: known(facts.apn),
      latitude: known(facts.latitude),
      longitude: known(facts.longitude),
      estimatedValue: known(facts.marketValue),
      county: known(facts.county),
      countyFips: known(facts.countyFips),
      propertyType: known(facts.propertyType),
      beds: known(facts.beds),
      baths: known(facts.baths),
      sqft: known(facts.sqft),
      lotSqft: known(facts.lotSqft),
      yearBuilt: known(facts.yearBuilt),
      assessedValue: known(facts.assessedValue),
      lastSaleDate: facts.lastSaleDate
        ? new Date(`${facts.lastSaleDate}T00:00:00Z`)
        : undefined,
      lastSalePrice: known(facts.lastSalePrice),
      ownerKind: known(facts.ownerKind),
      absentee: known(facts.absentee),
      dataSource: facts.source,
      dataSourceRef: known(facts.sourceRef),
      dataQuality: facts.quality,
      dataUpdatedAt: new Date(),
    };

    let propertyId = lead.properties[0]?.id ?? null;
    if (propertyId) {
      await this.prisma.property.update({ where: { id: propertyId }, data });
    } else {
      if (!address || !city || !state || !zip) return null;
      const existing = await this.prisma.property.findFirst({
        where: {
          accountId,
          address: { equals: address, mode: 'insensitive' },
          zip,
        },
        select: { id: true, leadId: true },
      });
      if (existing) {
        propertyId = existing.id;
        await this.prisma.property.update({
          where: { id: existing.id },
          data: { ...data, ...(existing.leadId ? {} : { leadId: lead.id }) },
        });
      } else {
        const created = await this.prisma.property.create({
          data: {
            accountId,
            leadId: lead.id,
            address,
            city,
            state,
            zip,
            ...data,
          },
        });
        propertyId = created.id;
      }
    }
    if (sourceRecordId) {
      await this.prisma.sourceRecord.updateMany({
        where: { id: sourceRecordId, propertyId: null },
        data: { propertyId },
      });
    }
    // A deal opened before the property existed points at it now.
    await this.prisma.deal.updateMany({
      where: { accountId, leadId: lead.id, propertyId: null },
      data: { propertyId },
    });
    return propertyId;
  }
}
