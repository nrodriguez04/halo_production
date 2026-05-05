import { Injectable, NotFoundException } from '@nestjs/common';
import {
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { LeadCreate, LeadUpdate, CSVImportRow } from '@halo/shared';
import * as reconciliationUtils from '@halo/shared';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class LeadsService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
  ) {}

  async create(data: LeadCreate, actorId: string | null = null) {
    const lead = await this.prisma.lead.create({
      data,
      include: {
        sourceRecords: true,
        properties: true,
      },
    });

    await this.timelineService.appendEvent({
      tenantId: lead.accountId,
      entityType: TimelineEntityType.LEAD,
      entityId: lead.id,
      eventType: 'LEAD_CREATED',
      payload: { status: lead.status, source: 'api' },
      actorId,
      actorType: actorId ? TimelineActorType.user : TimelineActorType.system,
    });

    return lead;
  }

  async findAll(
    accountId: string,
    options?: { status?: string; skip?: number; take?: number; search?: string },
  ) {
    const where: any = { accountId };
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      where.OR = [
        { canonicalAddress: { contains: q, mode: 'insensitive' } },
        { canonicalCity: { contains: q, mode: 'insensitive' } },
        { canonicalOwner: { contains: q, mode: 'insensitive' } },
      ];
    }

    const skip = options?.skip ?? 0;
    const take = Math.min(options?.take ?? 50, 200);

    // List view returns lightweight rows. Full relations are loaded on detail.
    return this.prisma.lead.findMany({
      where,
      skip,
      take,
      select: {
        id: true,
        accountId: true,
        status: true,
        score: true,
        tags: true,
        canonicalAddress: true,
        canonicalCity: true,
        canonicalState: true,
        canonicalZip: true,
        canonicalOwner: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { properties: true, deals: true } },
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

    if (!rows.length) return results;

    // Build (zip, normalizedAddress) pairs once so we don't call the normalizer twice per row.
    const normalized = rows
      .map((row, idx) => {
        try {
          return {
            idx,
            row,
            normalizedAddr: reconciliationUtils.normalizeAddress(
              row.address,
              row.city,
              row.state,
              row.zip,
            ),
            zip: (row.zip || '').trim(),
          };
        } catch (error) {
          results.errors.push(`Row ${row.address}: ${(error as Error).message}`);
          return null;
        }
      })
      .filter(
        (r): r is { idx: number; row: CSVImportRow; normalizedAddr: string; zip: string } =>
          !!r,
      );

    if (!normalized.length) return results;

    // Pull every existing canonical address in this account whose zip matches one of the
    // imports. With the (accountId, ...) + trgm indexes this is one bounded query, replacing
    // an N-row sequential `findFirst` loop.
    const zips = Array.from(new Set(normalized.map((r) => r.zip).filter(Boolean)));
    const existingRows = await this.prisma.lead.findMany({
      where: {
        accountId,
        ...(zips.length ? { canonicalZip: { in: zips } } : {}),
      },
      select: { canonicalAddress: true, canonicalZip: true },
    });

    const existingKeys = new Set(
      existingRows
        .filter((r) => r.canonicalAddress)
        .map((r) =>
          `${(r.canonicalZip || '').trim()}|${reconciliationUtils
            .normalizeAddress(r.canonicalAddress as string, undefined, undefined, r.canonicalZip || undefined)
            .toLowerCase()}`,
        ),
    );

    const toCreate: Array<{
      accountId: string;
      canonicalAddress: string;
      canonicalCity?: string;
      canonicalState?: string;
      canonicalZip?: string;
      canonicalOwner?: string;
      canonicalPhone?: string;
      canonicalEmail?: string;
      status: string;
      tags: string[];
    }> = [];

    const seenInBatch = new Set<string>();
    for (const r of normalized) {
      const key = `${r.zip}|${r.normalizedAddr.toLowerCase()}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        results.duplicates++;
        continue;
      }
      seenInBatch.add(key);
      toCreate.push({
        accountId,
        canonicalAddress: r.row.address,
        canonicalCity: r.row.city,
        canonicalState: r.row.state,
        canonicalZip: r.row.zip,
        canonicalOwner: r.row.owner,
        canonicalPhone: r.row.phone,
        canonicalEmail: r.row.email,
        status: 'new',
        tags: [],
      });
    }

    if (toCreate.length) {
      const result = await this.prisma.lead.createMany({
        data: toCreate,
        skipDuplicates: true,
      });
      results.created = result.count;
    }

    return results;
  }

  async findPotentialDuplicates(accountId: string, threshold = 0.8) {
    // Pull only the fields the comparison needs and bucket by (state, zip) so we run an
    // O(n²) similarity check inside small groups instead of across the whole account.
    const leads = await this.prisma.lead.findMany({
      where: { accountId },
      select: {
        id: true,
        accountId: true,
        canonicalAddress: true,
        canonicalCity: true,
        canonicalState: true,
        canonicalZip: true,
        canonicalOwner: true,
        canonicalPhone: true,
        canonicalEmail: true,
        status: true,
        score: true,
        tags: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const buckets = new Map<string, typeof leads>();
    for (const lead of leads) {
      const key = `${(lead.canonicalState || '').toUpperCase()}|${(lead.canonicalZip || '').trim()}`;
      const arr = buckets.get(key);
      if (arr) arr.push(lead);
      else buckets.set(key, [lead]);
    }

    const duplicates: Array<{
      lead1: any;
      lead2: any;
      similarity: number;
      reasons: string[];
    }> = [];

    for (const bucket of buckets.values()) {
      if (bucket.length < 2) continue;
      for (let i = 0; i < bucket.length; i++) {
        for (let j = i + 1; j < bucket.length; j++) {
          const lead1 = bucket[i];
          const lead2 = bucket[j];

          const reasons: string[] = [];
          let similarity = 0;

          const addr1 = reconciliationUtils.normalizeAddress(
            lead1.canonicalAddress || '',
            lead1.canonicalCity || undefined,
            lead1.canonicalState || undefined,
            lead1.canonicalZip || undefined,
          );
          const addr2 = reconciliationUtils.normalizeAddress(
            lead2.canonicalAddress || '',
            lead2.canonicalCity || undefined,
            lead2.canonicalState || undefined,
            lead2.canonicalZip || undefined,
          );

          const addrSimilarity = reconciliationUtils.stringSimilarity(addr1, addr2);
          if (addrSimilarity > 0.7) {
            similarity += addrSimilarity * 0.5;
            reasons.push(
              `Address similarity: ${(addrSimilarity * 100).toFixed(0)}%`,
            );
          }

          if (lead1.canonicalOwner && lead2.canonicalOwner) {
            const ownerSimilarity = reconciliationUtils.stringSimilarity(
              lead1.canonicalOwner,
              lead2.canonicalOwner,
            );
            if (ownerSimilarity > 0.7) {
              similarity += ownerSimilarity * 0.3;
              reasons.push(
                `Owner similarity: ${(ownerSimilarity * 100).toFixed(0)}%`,
              );
            }
          }

          if (lead1.canonicalPhone && lead2.canonicalPhone) {
            const phone1 = lead1.canonicalPhone.replace(/\D/g, '');
            const phone2 = lead2.canonicalPhone.replace(/\D/g, '');
            if (phone1 === phone2) {
              similarity += 0.2;
              reasons.push('Same phone number');
            }
          }

          if (similarity >= threshold) {
            duplicates.push({ lead1, lead2, similarity, reasons });
          }
        }
      }
    }

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

