import { BadRequestException, Injectable } from '@nestjs/common';
import {
  FUNNEL_RATE_BASE,
  FUNNEL_STAGES,
  FUNNEL_STAGE_DEFINITION,
  FUNNEL_STAGE_LABEL,
  allocateSpend,
  funnelBy,
  funnelRow,
  leadSource,
  type FunnelLead,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { GLOBAL_ACCOUNT_ID } from '../control-plane/control-plane.service';

const DAY = 86_400_000;
const CHUNK = 5_000;

function chunks<T>(list: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK)
    out.push(list.slice(i, i + CHUNK));
  return out;
}

/**
 * Conversion economics (docs/data-pipeline.md s5.1): the leads created in
 * a period, how far each got, what they cost and what they earned, by
 * source and by state. Built from records Hālo already keeps, and the
 * spend people entered for the same period; nothing is estimated.
 */
@Injectable()
export class FunnelService {
  constructor(private prisma: PrismaService) {}

  async funnel(accountId: string, q: { from?: Date; to?: Date }) {
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 90 * DAY);
    if (
      Number.isNaN(from.getTime()) ||
      Number.isNaN(to.getTime()) ||
      from >= to
    )
      throw new BadRequestException('from must be a date before to');
    if (to.getTime() - from.getTime() > 3 * 366 * DAY)
      throw new BadRequestException('The period is at most three years');

    const leads = await this.prisma.lead.findMany({
      where: { accountId, createdAt: { gte: from, lt: to } },
      select: {
        id: true,
        tags: true,
        canonicalState: true,
        canonicalPhoneHash: true,
        canonicalEmailHash: true,
      },
    });
    const ids = leads.map((l) => l.id);

    const suppressed = new Set<string>();
    const contacted = new Set<string>();
    const replied = new Set<string>();
    const cost = new Map<string, number>();
    const dealsByLead = new Map<string, string[]>();
    const offered = new Set<string>();
    const contracted = new Set<string>();
    const assigned = new Set<string>();
    const fees = new Map<string, number>();

    const phones = leads
      .map((l) => l.canonicalPhoneHash)
      .filter(Boolean) as string[];
    const emails = leads
      .map((l) => l.canonicalEmailHash)
      .filter(Boolean) as string[];
    for (const part of chunks(phones)) {
      const rows = await this.prisma.dNCList.findMany({
        where: {
          accountId: { in: [accountId, GLOBAL_ACCOUNT_ID] },
          phoneHash: { in: part },
        },
        select: { phoneHash: true },
      });
      rows.forEach((r) => r.phoneHash && suppressed.add(r.phoneHash));
    }
    for (const part of chunks(emails)) {
      const rows = await this.prisma.dNCList.findMany({
        where: {
          accountId: { in: [accountId, GLOBAL_ACCOUNT_ID] },
          emailHash: { in: part },
        },
        select: { emailHash: true },
      });
      rows.forEach((r) => r.emailHash && suppressed.add(r.emailHash));
    }

    for (const part of chunks(ids)) {
      const messages = await this.prisma.message.groupBy({
        by: ['leadId', 'direction'],
        where: {
          accountId,
          leadId: { in: part },
          OR: [
            { direction: 'outbound', status: { in: ['sent', 'delivered'] } },
            { direction: 'inbound' },
          ],
        },
        _count: { _all: true },
      });
      for (const m of messages) {
        if (!m.leadId) continue;
        (m.direction === 'inbound' ? replied : contacted).add(m.leadId);
      }

      const spend = await this.prisma.integrationCostEvent.groupBy({
        by: ['leadId'],
        where: { accountId, leadId: { in: part }, status: 'completed' },
        _sum: { actualCostUsd: true, estimatedCostUsd: true },
      });
      for (const s of spend) {
        if (!s.leadId) continue;
        cost.set(
          s.leadId,
          s._sum.actualCostUsd ?? s._sum.estimatedCostUsd ?? 0,
        );
      }

      const deals = await this.prisma.deal.findMany({
        where: { accountId, leadId: { in: part } },
        select: { id: true, leadId: true, offerAmount: true },
      });
      for (const d of deals) {
        if (!d.leadId) continue;
        dealsByLead.set(d.leadId, [...(dealsByLead.get(d.leadId) ?? []), d.id]);
        if (d.offerAmount != null) offered.add(d.id);
      }
    }

    const dealIds = [...dealsByLead.values()].flat();
    for (const part of chunks(dealIds)) {
      const [pas, aas, closings] = await Promise.all([
        this.prisma.purchaseAgreement.findMany({
          where: { accountId, dealId: { in: part }, executedAt: { not: null } },
          select: { dealId: true },
        }),
        this.prisma.assignmentAgreement.findMany({
          where: { accountId, dealId: { in: part }, executedAt: { not: null } },
          select: { dealId: true },
        }),
        this.prisma.closingFile.findMany({
          where: { accountId, dealId: { in: part }, status: 'closed' },
          select: { dealId: true, realizedFee: true },
        }),
      ]);
      pas.forEach((p) => contracted.add(p.dealId));
      aas.forEach((a) => assigned.add(a.dealId));
      closings.forEach((c) => fees.set(c.dealId, c.realizedFee ?? 0));
    }

    const unattributedCost = await this.prisma.integrationCostEvent.aggregate({
      where: {
        accountId,
        leadId: null,
        status: 'completed',
        createdAt: { gte: from, lt: to },
      },
      _sum: { actualCostUsd: true, estimatedCostUsd: true },
    });

    // Spent in the period, not on the period's leads: a mail drop's leads
    // arrive over weeks, so a longer period lines the two up better.
    const spend = allocateSpend(
      await this.prisma.marketingSpend.findMany({
        where: { accountId, spentOn: { gte: from, lt: to } },
        select: { source: true, state: true, amountUsd: true },
      }),
    );

    const records: FunnelLead[] = leads.map((l) => {
      const deals = dealsByLead.get(l.id) ?? [];
      const reachable =
        (!!l.canonicalPhoneHash && !suppressed.has(l.canonicalPhoneHash)) ||
        (!!l.canonicalEmailHash && !suppressed.has(l.canonicalEmailHash));
      const closedDeals = deals.filter((d) => fees.has(d));
      return {
        source: leadSource(l.tags),
        state: l.canonicalState?.toUpperCase() ?? null,
        reachable,
        contacted: contacted.has(l.id),
        conversation: replied.has(l.id),
        offer: deals.some((d) => offered.has(d)),
        contract: deals.some((d) => contracted.has(d)),
        assignment: deals.some((d) => assigned.has(d)),
        closed: closedDeals.length > 0,
        fee: closedDeals.reduce((sum, d) => sum + (fees.get(d) ?? 0), 0),
        costUsd: cost.get(l.id) ?? 0,
      };
    });

    return {
      from,
      to,
      stages: FUNNEL_STAGES.map((s) => ({
        key: s,
        label: FUNNEL_STAGE_LABEL[s],
        definition: FUNNEL_STAGE_DEFINITION[s],
        rateBase: s === 'leads' ? null : FUNNEL_RATE_BASE[s],
      })),
      total: funnelRow('all', records, spend.total),
      bySource: funnelBy(records, (l) => l.source, spend.bySource),
      byState: funnelBy(records, (l) => l.state ?? 'unknown', spend.byState),
      /** Entered spend in the period; the part that names no source or state is only in the total. */
      spend: {
        totalUsd: spend.total,
        withoutSourceUsd: spend.withoutSource,
        withoutStateUsd: spend.withoutState,
      },
      /** Provider spend in the period that no lead carries (area pulls, agents, tests). */
      unattributedCostUsd:
        Math.round(
          (unattributedCost._sum.actualCostUsd ??
            unattributedCost._sum.estimatedCostUsd ??
            0) * 100,
        ) / 100,
    };
  }
}
