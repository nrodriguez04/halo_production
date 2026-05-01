import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LeadCreate, LeadUpdate, CSVImportRow } from '@halo/shared';
import * as reconciliationUtils from '@halo/shared';

@Injectable()
export class LeadsService {
  constructor(private prisma: PrismaService) {}

  async create(data: LeadCreate) {
    return this.prisma.lead.create({
      data,
      include: {
        sourceRecords: true,
        properties: true,
      },
    });
  }

  async findAll(
    accountId: string,
    options?: { status?: string; skip?: number; take?: number },
  ) {
    const where: any = { accountId };
    if (options?.status) {
      where.status = options.status;
    }

    const skip = options?.skip ?? 0;
    const take = options?.take ?? 50;

    return this.prisma.lead.findMany({
      where,
      skip,
      take,
      include: {
        properties: true,
        deals: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, accountId: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, accountId },
      include: {
        sourceRecords: {
          orderBy: { createdAt: 'desc' },
        },
        properties: true,
        deals: true,
      },
    });

    if (!lead) {
      throw new NotFoundException(`Lead with ID ${id} not found`);
    }

    return lead;
  }

  async update(id: string, accountId: string, data: LeadUpdate) {
    const lead = await this.findOne(id, accountId);
    return this.prisma.lead.update({
      where: { id: lead.id },
      data,
    });
  }

  async remove(id: string, accountId: string) {
    const lead = await this.findOne(id, accountId);
    return this.prisma.lead.delete({
      where: { id: lead.id },
    });
  }

  async importCSV(rows: CSVImportRow[], accountId: string, userId: string) {
    const results = {
      created: 0,
      duplicates: 0,
      errors: [] as string[],
    };

    for (const row of rows) {
      try {
        // Normalize address for deduplication
        const normalizedAddr = reconciliationUtils.normalizeAddress(
          row.address,
          row.city,
          row.state,
          row.zip,
        );

        // Check for duplicates
        const existing = await this.prisma.lead.findFirst({
          where: {
            accountId,
            canonicalAddress: {
              contains: normalizedAddr,
            },
          },
        });

        if (existing) {
          results.duplicates++;
          continue;
        }

        // Create lead
        await this.prisma.lead.create({
          data: {
            accountId,
            canonicalAddress: row.address,
            canonicalCity: row.city,
            canonicalState: row.state,
            canonicalZip: row.zip,
            canonicalOwner: row.owner,
            canonicalPhone: row.phone,
            canonicalEmail: row.email,
            status: 'new',
            tags: [],
          },
        });

        results.created++;
      } catch (error) {
        results.errors.push(`Row ${row.address}: ${error.message}`);
      }
    }

    return results;
  }

  async findPotentialDuplicates(accountId: string, threshold = 0.8) {
    const leads = await this.prisma.lead.findMany({
      where: { accountId },
      include: {
        properties: true,
        sourceRecords: true,
      },
    });

    const duplicates: Array<{
      lead1: any;
      lead2: any;
      similarity: number;
      reasons: string[];
    }> = [];

    for (let i = 0; i < leads.length; i++) {
      for (let j = i + 1; j < leads.length; j++) {
        const lead1 = leads[i];
        const lead2 = leads[j];

        const reasons: string[] = [];
        let similarity = 0;

        // Check address similarity
        const addr1 = reconciliationUtils.normalizeAddress(
          lead1.canonicalAddress || '',
          lead1.canonicalCity,
          lead1.canonicalState,
          lead1.canonicalZip,
        );
        const addr2 = reconciliationUtils.normalizeAddress(
          lead2.canonicalAddress || '',
          lead2.canonicalCity,
          lead2.canonicalState,
          lead2.canonicalZip,
        );

        const addrSimilarity = reconciliationUtils.stringSimilarity(addr1, addr2);
        if (addrSimilarity > 0.7) {
          similarity += addrSimilarity * 0.5;
          reasons.push(`Address similarity: ${(addrSimilarity * 100).toFixed(0)}%`);
        }

        // Check owner name similarity
        if (lead1.canonicalOwner && lead2.canonicalOwner) {
          const ownerSimilarity = reconciliationUtils.stringSimilarity(
            lead1.canonicalOwner,
            lead2.canonicalOwner,
          );
          if (ownerSimilarity > 0.7) {
            similarity += ownerSimilarity * 0.3;
            reasons.push(`Owner similarity: ${(ownerSimilarity * 100).toFixed(0)}%`);
          }
        }

        // Check phone similarity
        if (lead1.canonicalPhone && lead2.canonicalPhone) {
          const phone1 = lead1.canonicalPhone.replace(/\D/g, '');
          const phone2 = lead2.canonicalPhone.replace(/\D/g, '');
          if (phone1 === phone2) {
            similarity += 0.2;
            reasons.push('Same phone number');
          }
        }

        if (similarity >= threshold) {
          duplicates.push({
            lead1,
            lead2,
            similarity,
            reasons,
          });
        }
      }
    }

    // Sort by similarity descending
    duplicates.sort((a, b) => b.similarity - a.similarity);

    return duplicates;
  }

  async mergeLeads(
    sourceId: string,
    targetId: string,
    accountId: string,
    userId: string,
  ) {
    const source = await this.findOne(sourceId, accountId);
    const target = await this.findOne(targetId, accountId);

    // Merge source records
    await this.prisma.sourceRecord.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });

    // Merge properties
    await this.prisma.property.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });

    // Merge deals
    await this.prisma.deal.updateMany({
      where: { leadId: sourceId },
      data: { leadId: targetId },
    });

    // Update target with best data from source
    const updates: any = {};
    if (!target.canonicalAddress && source.canonicalAddress) {
      updates.canonicalAddress = source.canonicalAddress;
    }
    if (!target.canonicalCity && source.canonicalCity) {
      updates.canonicalCity = source.canonicalCity;
    }
    if (!target.canonicalState && source.canonicalState) {
      updates.canonicalState = source.canonicalState;
    }
    if (!target.canonicalZip && source.canonicalZip) {
      updates.canonicalZip = source.canonicalZip;
    }
    if (!target.canonicalOwner && source.canonicalOwner) {
      updates.canonicalOwner = source.canonicalOwner;
    }
    if (!target.canonicalPhone && source.canonicalPhone) {
      updates.canonicalPhone = source.canonicalPhone;
    }
    if (!target.canonicalEmail && source.canonicalEmail) {
      updates.canonicalEmail = source.canonicalEmail;
    }

    if (Object.keys(updates).length > 0) {
      await this.prisma.lead.update({
        where: { id: targetId },
        data: updates,
      });
    }

    // Delete source lead
    await this.prisma.lead.delete({
      where: { id: sourceId },
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        userId,
        accountId: target.accountId,
        action: 'lead.merge',
        resource: `lead:${targetId}`,
        details: {
          sourceId,
          targetId,
          mergedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true, mergedInto: targetId };
  }

  async markAsDistinct(
    lead1Id: string,
    lead2Id: string,
    accountId: string,
    userId: string,
  ) {
    await this.findOne(lead1Id, accountId);
    await this.findOne(lead2Id, accountId);

    // Store decision to avoid re-checking
    await this.prisma.auditLog.create({
      data: {
        userId,
        accountId,
        action: 'lead.mark_distinct',
        resource: `lead:${lead1Id}`,
        details: {
          lead1Id,
          lead2Id,
          markedAt: new Date().toISOString(),
        },
      },
    });

    return { success: true };
  }
}

