import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { Prisma, TimelineActorType, TimelineEntityType } from '@prisma/client';
import {
  discoverInvestors,
  normalizePartyName,
  toJurisdictionCode,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { TimelineService } from '../timeline/timeline.service';
import { toNormalized } from './recorded-sales.service';

const DAY = 86_400_000;

/**
 * Cash-buyer discovery from recorded sales (docs/data-pipeline.md s4).
 * Candidates carry the evidence (recorded purchases) and an inferred buy
 * box. A person promotes one into a buyer; the purchases go with it as
 * public-record transactions, so the buyer ranking weighs them as history,
 * not as current interest or proof of funds. A promoted buyer has no
 * contact and no consent until someone records them.
 */
@Injectable()
export class InvestorDiscoveryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private timeline: TimelineService,
  ) {}

  async refresh(
    accountId: string,
    userId: string,
    opts: {
      state?: string | null;
      windowDays?: number;
      minPurchases?: number;
    } = {},
  ) {
    const asOf = new Date();
    const windowDays = Math.min(Math.max(opts.windowDays ?? 730, 90), 1825);
    const state = opts.state ? toJurisdictionCode(opts.state) : null;
    // Resales up to 18 months after a purchase count, so look a little past the window.
    const rows = await this.prisma.recordedSale.findMany({
      where: {
        accountId,
        ...(state ? { state } : {}),
        saleDate: { gte: new Date(asOf.getTime() - windowDays * DAY) },
      },
    });
    const found = discoverInvestors(rows.map(toNormalized), {
      asOf,
      windowDays,
      minPurchases: opts.minPurchases ?? 2,
    });
    const buyers = await this.prisma.buyer.findMany({
      where: { accountId },
      select: { id: true, name: true, company: true },
    });
    const byName = new Map<string, string>();
    for (const b of buyers) {
      for (const n of [b.company, b.name]) {
        const k = normalizePartyName(n);
        if (k) byName.set(k, b.id);
      }
    }
    let created = 0;
    let updated = 0;
    let linked = 0;
    for (const c of found) {
      const stats = {
        name: c.name,
        kind: c.kind,
        mailingZip: c.mailingZip,
        purchaseCount: c.purchaseCount,
        cashPurchases: c.cashPurchases,
        financedPurchases: c.financedPurchases,
        resales: c.resales,
        medianHoldDays: c.medianHoldDays,
        firstPurchase: new Date(`${c.firstPurchase}T00:00:00Z`),
        lastPurchase: new Date(`${c.lastPurchase}T00:00:00Z`),
        states: c.buyBox.states,
        buyBox: c.buyBox as unknown as Prisma.InputJsonObject,
        purchases: c.purchases as unknown as Prisma.InputJsonArray,
        score: c.score,
        reasons: c.reasons,
        refreshedAt: asOf,
      };
      const existing = await this.prisma.buyerCandidate.findUnique({
        where: { accountId_key: { accountId, key: c.key } },
        select: { id: true, status: true },
      });
      // Someone already a buyer is linked, not offered again.
      const already = byName.get(normalizePartyName(c.name));
      if (existing) {
        await this.prisma.buyerCandidate.update({
          where: { id: existing.id },
          data: {
            ...stats,
            ...(existing.status === 'candidate' && already
              ? { status: 'promoted', buyerId: already }
              : {}),
          },
        });
        updated += 1;
      } else {
        await this.prisma.buyerCandidate.create({
          data: {
            accountId,
            key: c.key,
            ...stats,
            ...(already ? { status: 'promoted', buyerId: already } : {}),
          },
        });
        created += 1;
      }
      if (already) linked += 1;
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'buyers.discovery.refresh',
      resource: 'buyer_candidates',
      details: {
        state,
        windowDays,
        sales: rows.length,
        candidates: found.length,
        created,
        updated,
        linked,
      },
    });
    return {
      sales: rows.length,
      candidates: found.length,
      created,
      updated,
      linkedToExistingBuyers: linked,
    };
  }

  async list(
    accountId: string,
    q: { status?: string; state?: string; limit?: number },
  ) {
    const state = q.state ? toJurisdictionCode(q.state) : null;
    return this.prisma.buyerCandidate.findMany({
      where: {
        accountId,
        status: q.status ?? 'candidate',
        ...(state ? { states: { has: state } } : {}),
      },
      orderBy: [{ score: 'desc' }, { lastPurchase: 'desc' }],
      take: Math.min(q.limit ?? 50, 200),
    });
  }

  /**
   * Make a candidate a buyer. The buy box is marked as inferred; the
   * recorded purchases become public-record transactions with their
   * references. No contact, consent or proof of funds is assumed.
   */
  async promote(accountId: string, id: string, userId: string) {
    const c = await this.prisma.buyerCandidate.findFirst({
      where: { id, accountId },
    });
    if (!c) throw new NotFoundException('Candidate not found');
    if (c.status !== 'candidate')
      throw new ConflictException(`This candidate is already ${c.status}.`);
    const box = c.buyBox as {
      cities?: string[];
      zips?: string[];
      priceMin?: number | null;
      priceMax?: number | null;
      propertyTypes?: string[];
    };
    const purchases = (c.purchases ?? []) as Array<{
      sourceRef: string;
      saleDate: string;
      price: number | null;
      state: string;
      city: string | null;
      zip: string | null;
      propertyType: string | null;
    }>;
    const buyer = await this.prisma.$transaction(async (tx) => {
      const b = await tx.buyer.create({
        data: {
          accountId,
          name: c.name,
          company: c.kind === 'individual' ? null : c.name,
          source: 'public_record',
          sourceDetail: `Discovered from ${c.purchaseCount} recorded purchase(s), ${c.cashPurchases} without a recorded mortgage. Buy box inferred, not stated.`,
          status: 'active',
          preferences: {
            locations: [...(box.cities ?? []), ...(box.zips ?? [])].slice(
              0,
              50,
            ),
            priceRange: {
              min: box.priceMin ?? null,
              max: box.priceMax ?? null,
            },
            propertyTypes: (box.propertyTypes ?? []).slice(0, 20),
            inferred: true,
          } as Prisma.InputJsonObject,
        },
      });
      for (const p of purchases) {
        await tx.buyerTransaction.create({
          data: {
            accountId,
            buyerId: b.id,
            city: p.city,
            state: p.state,
            zip: p.zip,
            propertyType: p.propertyType,
            price: p.price,
            closedAt: new Date(`${p.saleDate}T00:00:00Z`),
            source: 'public_record',
            sourceRef: p.sourceRef,
          },
        });
      }
      await tx.buyerCandidate.update({
        where: { id: c.id },
        data: { status: 'promoted', buyerId: b.id },
      });
      return b;
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'buyers.discovery.promote',
      resource: `buyer:${buyer.id}`,
      details: { candidateId: c.id, key: c.key, purchases: purchases.length },
    });
    await this.timeline.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.BUYER,
      entityId: buyer.id,
      eventType: 'BUYER_DISCOVERED',
      payload: {
        candidateId: c.id,
        purchases: purchases.length,
        cashPurchases: c.cashPurchases,
      },
      actorId: userId,
      actorType: TimelineActorType.user,
    });
    return { buyerId: buyer.id };
  }

  async dismiss(accountId: string, id: string, userId: string, reason: string) {
    const c = await this.prisma.buyerCandidate.findFirst({
      where: { id, accountId },
    });
    if (!c) throw new NotFoundException('Candidate not found');
    await this.prisma.buyerCandidate.update({
      where: { id: c.id },
      data: { status: 'dismissed', dismissedReason: reason },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'buyers.discovery.dismiss',
      resource: `buyer_candidate:${c.id}`,
      details: { reason },
    });
    return { dismissed: true };
  }
}
