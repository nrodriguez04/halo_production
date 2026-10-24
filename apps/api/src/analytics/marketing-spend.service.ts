import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SpendInput } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';

const DAY = 86_400_000;

/**
 * Spend a person enters because no provider call records it: a mail drop,
 * an ad campaign, a bought list (docs/data-pipeline.md s5.1). The funnel
 * reads it as cost. Every entry and removal is audited, since it changes
 * what each channel appears to return.
 */
@Injectable()
export class MarketingSpendService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  list(accountId: string, q: { from: Date; to: Date }) {
    return this.prisma.marketingSpend.findMany({
      where: { accountId, spentOn: { gte: q.from, lt: q.to } },
      orderBy: [{ spentOn: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
  }

  async add(accountId: string, userId: string | undefined, q: SpendInput) {
    // Noon UTC, so the date means the same day in every US zone.
    const spentOn = new Date(`${q.spentOn}T12:00:00Z`);
    if (Number.isNaN(spentOn.getTime()))
      throw new BadRequestException('spentOn is not a date');
    if (spentOn.getTime() > Date.now() + DAY)
      throw new BadRequestException(
        'Enter spend on the day it was paid, not ahead of it',
      );
    const row = await this.prisma.marketingSpend.create({
      data: {
        accountId,
        category: q.category,
        amountUsd: q.amountUsd,
        spentOn,
        source: q.source,
        state: q.state,
        vendor: q.vendor,
        note: q.note,
        createdBy: userId ?? null,
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'analytics.spend.add',
      resource: `marketing_spend:${row.id}`,
      details: {
        category: row.category,
        amountUsd: row.amountUsd,
        spentOn: q.spentOn,
        source: row.source,
        state: row.state,
      },
    });
    return row;
  }

  async remove(accountId: string, userId: string | undefined, id: string) {
    const row = await this.prisma.marketingSpend.findFirst({
      where: { id, accountId },
    });
    if (!row) throw new NotFoundException('No such spend entry');
    await this.prisma.marketingSpend.delete({ where: { id } });
    await this.audit.log({
      accountId,
      userId,
      action: 'analytics.spend.remove',
      resource: `marketing_spend:${id}`,
      details: {
        category: row.category,
        amountUsd: row.amountUsd,
        spentOn: row.spentOn.toISOString().slice(0, 10),
        source: row.source,
        state: row.state,
      },
    });
    return { removed: id };
  }
}
