import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buyBoxFromPreferences,
  matchExplanation,
  rankBuyersForDeal,
  type BuyerMatch,
  type BuyerStatus,
  type BuyerTransactionSource,
  type FundingType,
  type PofStatus,
  type RankingBuyer,
  type RankingDeal,
} from '@halo/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { PIIService } from '../pii/pii.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../audit/audit.service';
import type { PiiViewer } from '../auth/pii-access';
import { dealBuyerPrice } from '../deals/buyer-price';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { protectEmail, protectPhone } from '../pii/contact-crypto';
import { buyerEvent } from '../disposition/timeline-events';
import { assertBuyerDocument } from '../disposition/document-refs';
import { protectBuyerContact } from './buyer-pii';

/** Intents that mean a buyer wants this kind of deal (Buyer Responder / deal page). */
const INTEREST_INTENTS = new Set(['interested', 'offer']);

export interface RankedBuyer extends BuyerMatch {
  explanation: string;
}

/**
 * The buyer side of contract flipping (docs/contract-flipping.md s5): what
 * Halo knows about each cash buyer, kept by kind of evidence, and the
 * ranking of buyers for a deal built on it (packages/shared
 * disposition/buyer-ranking.ts). Contacts stay sealed: ranking reads blind
 * indexes only, so consent and do-not-contact are checked without opening
 * an address.
 */
@Injectable()
export class BuyerIntelligenceService {
  constructor(
    private prisma: PrismaService,
    private pii: PIIService,
    private timeline: TimelineService,
    private audit: AuditService,
  ) {}

  // -------------------------------------------------------------- ranking

  async rankForDeal(
    accountId: string,
    dealId: string,
    opts: {
      limit?: number;
      now?: Date;
      buyerPriceOverride?: number | null;
    } = {},
  ): Promise<{
    deal: RankingDeal;
    matches: RankedBuyer[];
    considered: number;
  }> {
    const now = opts.now ?? new Date();
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        property: true,
        economics: true,
        lead: { select: { canonicalState: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const price =
      opts.buyerPriceOverride ??
      (await dealBuyerPrice(this.prisma, accountId, deal))?.price ??
      null;
    const rankingDeal: RankingDeal = {
      city: deal.property?.city ?? null,
      state: normalizeState(
        deal.property?.state ?? deal.lead?.canonicalState ?? null,
      ),
      zip: deal.property?.zip ?? null,
      propertyType: null,
      buyerPrice: price,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
    };
    const buyers = await this.rankingBuyers(accountId);
    const ranked = rankBuyersForDeal(rankingDeal, buyers, now).map((m) => ({
      ...m,
      explanation: matchExplanation(m),
    }));
    return {
      deal: rankingDeal,
      matches: opts.limit ? ranked.slice(0, opts.limit) : ranked,
      considered: buyers.length,
    };
  }

  /** Every buyer of the tenant as the ranking sees them. */
  async rankingBuyers(
    accountId: string,
    buyerIds?: string[],
  ): Promise<RankingBuyer[]> {
    const buyers = await this.prisma.buyer.findMany({
      where: { accountId, ...(buyerIds ? { id: { in: buyerIds } } : {}) },
      include: { transactions: true },
      take: 2000,
    });
    if (buyers.length === 0) return [];
    const ids = buyers.map((b) => b.id);
    const emailHashes = buyers
      .map((b) => b.emailHash)
      .filter((h): h is string => !!h);
    const phoneHashes = buyers
      .map((b) => b.phoneHash)
      .filter((h): h is string => !!h);
    const hashes = [...emailHashes, ...phoneHashes];

    const [consents, dnc, messages, offers, assignments, targets] =
      await Promise.all([
        this.prisma.consent.findMany({
          where: {
            accountId,
            revokedAt: null,
            OR: [
              ...(emailHashes.length
                ? [{ emailHash: { in: emailHashes } }]
                : []),
              ...(phoneHashes.length
                ? [{ phoneHash: { in: phoneHashes } }]
                : []),
            ],
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
          select: { channel: true, emailHash: true, phoneHash: true },
        }),
        this.prisma.dNCList.findMany({
          where: {
            accountId: { in: [accountId, 'GLOBAL'] },
            OR: [
              ...(emailHashes.length
                ? [{ emailHash: { in: emailHashes } }]
                : []),
              ...(phoneHashes.length
                ? [{ phoneHash: { in: phoneHashes } }]
                : []),
            ],
            AND: [
              { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            ],
          },
          select: { emailHash: true, phoneHash: true },
        }),
        hashes.length
          ? this.prisma.message.findMany({
              where: { accountId, counterpartyHash: { in: hashes } },
              select: {
                counterpartyHash: true,
                direction: true,
                status: true,
                metadata: true,
              },
              take: 10_000,
              orderBy: { createdAt: 'desc' },
            })
          : Promise.resolve([]),
        this.prisma.buyerOffer.findMany({
          where: { accountId, buyerId: { in: ids } },
          select: { buyerId: true, status: true },
        }),
        this.prisma.assignmentAgreement.findMany({
          where: { accountId, buyerId: { in: ids } },
          select: {
            buyerId: true,
            status: true,
            cancellationReason: true,
            dealId: true,
          },
        }),
        this.prisma.dispositionTarget.findMany({
          where: {
            accountId,
            buyerId: { in: ids },
            status: { in: ['interested', 'offered'] },
          },
          select: { buyerId: true },
        }),
      ]);

    const closedDeals = new Set(
      (
        await this.prisma.closingFile.findMany({
          where: {
            accountId,
            status: 'closed',
            dealId: { in: assignments.map((a) => a.dealId) },
          },
          select: { dealId: true },
        })
      ).map((c) => c.dealId),
    );
    const consentFor = (hash: string | null, channel: string) =>
      !!hash &&
      consents.some(
        (c) =>
          c.channel === channel &&
          (c.emailHash === hash || c.phoneHash === hash),
      );
    const optedOut = (b: {
      emailHash: string | null;
      phoneHash: string | null;
    }) =>
      dnc.some(
        (d) =>
          (b.emailHash && d.emailHash === b.emailHash) ||
          (b.phoneHash && d.phoneHash === b.phoneHash),
      );

    return buyers.map((b): RankingBuyer => {
      const mine = messages.filter(
        (m) =>
          m.counterpartyHash &&
          (m.counterpartyHash === b.emailHash ||
            m.counterpartyHash === b.phoneHash),
      );
      const replies = mine.filter((m) => m.direction === 'inbound');
      const interestedReplies = replies.filter((m) =>
        INTEREST_INTENTS.has(
          String((m.metadata as Record<string, unknown> | null)?.intent ?? ''),
        ),
      ).length;
      const myOffers = offers.filter((o) => o.buyerId === b.id);
      const myAssignments = assignments.filter((a) => a.buyerId === b.id);
      return {
        id: b.id,
        name: b.name,
        status: (b.status as BuyerStatus) ?? 'active',
        hasEmail: !!b.emailHash,
        hasPhone: !!b.phoneHash,
        emailConsent: consentFor(b.emailHash, 'email'),
        smsConsent: consentFor(b.phoneHash, 'sms'),
        optedOut: optedOut(b),
        buyBox: buyBoxFromPreferences(b.preferences),
        fundingType: (b.fundingType as FundingType) ?? 'unknown',
        pof: {
          status: (b.pofStatus as PofStatus) ?? 'none',
          amount: b.pofAmount,
          expiresAt: b.pofExpiresAt,
        },
        transactions: b.transactions.map((t) => ({
          city: t.city,
          state: normalizeState(t.state),
          zip: t.zip,
          propertyType: t.propertyType,
          price: t.price,
          closedAt: t.closedAt,
          source: t.source as BuyerTransactionSource,
        })),
        engagement: {
          sent: mine.filter(
            (m) =>
              m.direction === 'outbound' &&
              ['sent', 'delivered'].includes(m.status),
          ).length,
          replies: replies.length,
          interested:
            interestedReplies +
            targets.filter((t) => t.buyerId === b.id).length,
        },
        outcomes: {
          offers: myOffers.length,
          accepted: myAssignments.length,
          closed: myAssignments.filter(
            (a) => a.status === 'executed' && closedDeals.has(a.dealId),
          ).length,
          fellThrough: myAssignments.filter(
            (a) =>
              a.status === 'cancelled' &&
              (a.cancellationReason ?? '').startsWith('buyer_default'),
          ).length,
        },
      };
    });
  }

  // -------------------------------------------------------------- profile

  /** One buyer with everything Halo knows, each kind of evidence apart. */
  async profile(accountId: string, buyerId: string, viewer?: PiiViewer | null) {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: buyerId, accountId },
      include: {
        transactions: { orderBy: { closedAt: 'desc' } },
        offers: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: {
            deal: {
              select: {
                id: true,
                property: {
                  select: { address: true, city: true, state: true },
                },
              },
            },
          },
        },
      },
    });
    if (!buyer) throw new NotFoundException(`Buyer ${buyerId} not found`);
    const [ranking] = await this.rankingBuyers(accountId, [buyerId]);
    const consents = await this.prisma.consent.findMany({
      where: {
        accountId,
        OR: [
          ...(buyer.emailHash ? [{ emailHash: buyer.emailHash }] : []),
          ...(buyer.phoneHash ? [{ phoneHash: buyer.phoneHash }] : []),
        ],
      },
      select: {
        id: true,
        channel: true,
        source: true,
        grantedAt: true,
        revokedAt: true,
        evidence: true,
      },
      orderBy: { grantedAt: 'desc' },
    });
    const { transactions, offers, ...rest } = buyer;
    const presented = await this.pii.presentBuyer(rest, viewer);
    const prices = transactions
      .map((t) => t.price)
      .filter((p): p is number => !!p);
    return {
      buyer: presented,
      evidence: {
        statedBuyBox: buyBoxFromPreferences(buyer.preferences),
        historicalPurchases: {
          count: transactions.length,
          verified: transactions.filter(
            (t) => t.source === 'public_record' || t.source === 'halo_closing',
          ).length,
          range: prices.length
            ? { min: Math.min(...prices), max: Math.max(...prices) }
            : null,
        },
        proofOfFunds: {
          status: buyer.pofStatus,
          amount: buyer.pofAmount,
          verifiedAt: buyer.pofVerifiedAt,
          expiresAt: buyer.pofExpiresAt,
        },
        engagement: ranking?.engagement ?? null,
        outcomes: ranking?.outcomes ?? null,
        contactable: {
          optedOut: ranking?.optedOut ?? false,
          emailConsent: ranking?.emailConsent ?? false,
          smsConsent: ranking?.smsConsent ?? false,
        },
      },
      transactions,
      offers,
      consents: consents.map((c) => ({ ...c, evidence: c.evidence ?? null })),
    };
  }

  async updateProfile(
    accountId: string,
    buyerId: string,
    userId: string,
    patch: {
      company?: string | null;
      status?: string;
      source?: string;
      sourceDetail?: string | null;
      fundingType?: string;
      notes?: string | null;
      preferences?: Record<string, unknown>;
    },
  ) {
    await this.owned(accountId, buyerId);
    const { preferences, ...rest } = patch;
    const updated = await this.prisma.buyer.update({
      where: { id: buyerId },
      data: {
        ...rest,
        ...(preferences
          ? { preferences: preferences as Prisma.InputJsonObject }
          : {}),
      },
    });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_PROFILE_UPDATED',
      {
        fields: Object.keys(patch),
        ...(patch.status ? { status: patch.status } : {}),
      },
      userId,
    );
    return this.pii.presentBuyer(updated);
  }

  /**
   * Proof of funds. Only `verified` counts as proof, and verifying needs the
   * document and the amount it shows: a person looked at a bank letter, not
   * at a buyer's say-so.
   */
  async setProofOfFunds(
    accountId: string,
    buyerId: string,
    userId: string,
    input: {
      status: 'requested' | 'received' | 'verified' | 'rejected';
      amount?: number | null;
      documentId?: string;
      expiresAt?: Date | null;
    },
  ) {
    await this.owned(accountId, buyerId);
    if (input.documentId) {
      await assertBuyerDocument(
        this.prisma,
        accountId,
        input.documentId,
        buyerId,
        'Proof of funds',
      );
    }
    const verified = input.status === 'verified';
    const updated = await this.prisma.buyer.update({
      where: { id: buyerId },
      data: {
        pofStatus: input.status,
        ...(input.amount !== undefined ? { pofAmount: input.amount } : {}),
        ...(input.documentId ? { pofDocumentId: input.documentId } : {}),
        ...(input.expiresAt !== undefined
          ? { pofExpiresAt: input.expiresAt }
          : {}),
        pofVerifiedAt: verified ? new Date() : null,
        pofVerifiedBy: verified ? userId : null,
      },
    });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_PROOF_OF_FUNDS',
      {
        status: input.status,
        amount: input.amount ?? null,
        documentId: input.documentId ?? null,
      },
      userId,
    );
    await this.audit.log({
      accountId,
      userId,
      action: `buyer.pof.${input.status}`,
      resource: `buyer:${buyerId}`,
      details: {
        amount: input.amount ?? null,
        documentId: input.documentId ?? null,
      },
    });
    return this.pii.presentBuyer(updated);
  }

  async addTransaction(
    accountId: string,
    buyerId: string,
    userId: string,
    input: {
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      propertyType?: string;
      price?: number;
      closedAt?: Date;
      source: BuyerTransactionSource;
      sourceRef?: string;
    },
  ) {
    await this.owned(accountId, buyerId);
    if (input.source === 'public_record' && !input.sourceRef) {
      throw new BadRequestException(
        'A public-record purchase needs its reference (recording number, deed book/page or the record URL).',
      );
    }
    const tx = await this.prisma.buyerTransaction.create({
      data: { accountId, buyerId, ...input, createdBy: userId },
    });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_PURCHASE_RECORDED',
      {
        transactionId: tx.id,
        source: tx.source,
        city: tx.city,
        price: tx.price,
      },
      userId,
    );
    return tx;
  }

  async removeTransaction(
    accountId: string,
    buyerId: string,
    txId: string,
    userId: string,
  ) {
    const tx = await this.prisma.buyerTransaction.findFirst({
      where: { id: txId, accountId, buyerId },
    });
    if (!tx) throw new NotFoundException(`Purchase ${txId} not found`);
    if (tx.source === 'halo_closing') {
      throw new BadRequestException(
        'A closing recorded by Halo cannot be removed.',
      );
    }
    await this.prisma.buyerTransaction.delete({ where: { id: tx.id } });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_PURCHASE_REMOVED',
      { transactionId: tx.id },
      userId,
    );
    return { removed: tx.id };
  }

  // -------------------------------------------------------------- consent

  /**
   * Record that a buyer agreed to receive deals on a channel, with the
   * evidence. Without a consent Halo will not message a buyer: the send
   * path's consent rule applies to buyers as it does to sellers.
   */
  async recordConsent(
    accountId: string,
    buyerId: string,
    userId: string | null,
    input: {
      channel: 'email' | 'sms';
      source: string;
      evidence: string | Record<string, unknown>;
    },
  ) {
    const buyer = await this.owned(accountId, buyerId);
    const hash = input.channel === 'email' ? buyer.emailHash : buyer.phoneHash;
    const enc = input.channel === 'email' ? buyer.emailEnc : buyer.phoneEnc;
    if (!hash || !enc) {
      throw new BadRequestException(
        `The buyer has no ${input.channel === 'email' ? 'email address' : 'phone number'} on file.`,
      );
    }
    const optedOut = await this.prisma.dNCList.findFirst({
      where: {
        accountId: { in: [accountId, 'GLOBAL'] },
        ...(input.channel === 'email'
          ? { emailHash: hash }
          : { phoneHash: hash }),
      },
      select: { id: true },
    });
    if (optedOut) {
      throw new BadRequestException(
        'This contact asked not to be contacted. A new consent must come from the buyer, through the deal page or in writing, after which remove the do-not-contact entry deliberately.',
      );
    }
    const existing = await this.prisma.consent.findFirst({
      where: {
        accountId,
        channel: input.channel,
        revokedAt: null,
        ...(input.channel === 'email'
          ? { emailHash: hash }
          : { phoneHash: hash }),
      },
      select: { id: true },
    });
    if (existing) return { consentId: existing.id, alreadyRecorded: true };
    const consent = await this.prisma.consent.create({
      data: {
        accountId,
        channel: input.channel,
        source: input.source,
        evidence: (typeof input.evidence === 'string'
          ? { statement: input.evidence, recordedBy: userId, buyerId }
          : {
              ...input.evidence,
              recordedBy: userId,
              buyerId,
            }) as Prisma.InputJsonObject,
        ...(input.channel === 'email'
          ? { emailHash: hash, emailEnc: enc }
          : { phoneHash: hash, phoneEnc: enc }),
      },
    });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_CONSENT_RECORDED',
      {
        consentId: consent.id,
        channel: input.channel,
        source: input.source,
      },
      userId,
    );
    await this.audit.log({
      accountId,
      userId: userId ?? undefined,
      action: 'buyer.consent.record',
      resource: `buyer:${buyerId}`,
      details: { channel: input.channel, source: input.source },
    });
    return { consentId: consent.id, alreadyRecorded: false };
  }

  async revokeConsent(
    accountId: string,
    buyerId: string,
    userId: string,
    channel: 'email' | 'sms',
  ) {
    const buyer = await this.owned(accountId, buyerId);
    const hash = channel === 'email' ? buyer.emailHash : buyer.phoneHash;
    if (!hash) return { revoked: 0 };
    const res = await this.prisma.consent.updateMany({
      where: {
        accountId,
        channel,
        revokedAt: null,
        ...(channel === 'email' ? { emailHash: hash } : { phoneHash: hash }),
      },
      data: { revokedAt: new Date() },
    });
    await buyerEvent(
      this.timeline,
      accountId,
      buyerId,
      'BUYER_CONSENT_REVOKED',
      { channel, count: res.count },
      userId,
    );
    return { revoked: res.count };
  }

  // --------------------------------------------------------------- import

  /**
   * Import buyers from a list the operator is allowed to use. Every buyer
   * carries the list as its source. Email consent is recorded only when the
   * operator states how everyone on the list asked to receive deals; a
   * contact already on the do-not-contact list never gets one.
   */
  async importBuyers(
    accountId: string,
    userId: string,
    input: {
      source: string;
      sourceDetail: string;
      emailConsentBasis?: string;
      rows: Array<{
        name: string;
        company?: string;
        email?: string;
        phone?: string;
        locations?: string[];
        priceMin?: number;
        priceMax?: number;
        propertyTypes?: string[];
        fundingType?: string;
      }>;
    },
  ) {
    let created = 0;
    let updated = 0;
    let consents = 0;
    const skipped: string[] = [];
    for (const row of input.rows) {
      const email = protectEmail(row.email ?? null);
      const phone = protectPhone(row.phone ?? null);
      if (!email.emailHash && !phone.phoneHash) {
        skipped.push(`${row.name}: no email or phone`);
        continue;
      }
      const match = await this.prisma.buyer.findFirst({
        where: {
          accountId,
          OR: [
            ...(email.emailHash ? [{ emailHash: email.emailHash }] : []),
            ...(phone.phoneHash ? [{ phoneHash: phone.phoneHash }] : []),
          ],
        },
      });
      const preferences = {
        locations: row.locations ?? [],
        ...(row.priceMin != null || row.priceMax != null
          ? {
              priceRange: {
                min: row.priceMin ?? null,
                max: row.priceMax ?? null,
              },
            }
          : {}),
        propertyTypes: row.propertyTypes ?? [],
      };
      let buyerId: string;
      if (match) {
        // Never overwrite what a person curated; only fill gaps.
        const prefs = (match.preferences ?? {}) as Record<string, unknown>;
        await this.prisma.buyer.update({
          where: { id: match.id },
          data: {
            company: match.company ?? row.company ?? null,
            ...(match.fundingType === 'unknown' && row.fundingType
              ? { fundingType: row.fundingType }
              : {}),
            ...(Object.keys(prefs).length === 0
              ? { preferences: preferences as Prisma.InputJsonObject }
              : {}),
            ...(match.emailHash
              ? {}
              : protectBuyerContact({ email: row.email ?? undefined })),
            ...(match.phoneHash
              ? {}
              : protectBuyerContact({ phone: row.phone ?? undefined })),
          },
        });
        buyerId = match.id;
        updated += 1;
      } else {
        const b = await this.prisma.buyer.create({
          data: {
            accountId,
            name: row.name,
            company: row.company ?? null,
            fundingType: row.fundingType ?? 'unknown',
            source: input.source,
            sourceDetail: input.sourceDetail,
            preferences: preferences as Prisma.InputJsonObject,
            ...protectBuyerContact({
              email: row.email ?? undefined,
              phone: row.phone ?? undefined,
            }),
          },
        });
        buyerId = b.id;
        created += 1;
      }
      if (input.emailConsentBasis && email.emailHash) {
        try {
          const r = await this.recordConsent(accountId, buyerId, userId, {
            channel: 'email',
            source: 'form',
            evidence: {
              statement: input.emailConsentBasis,
              list: input.sourceDetail,
              importedAt: new Date().toISOString(),
            },
          });
          if (!r.alreadyRecorded) consents += 1;
        } catch (err) {
          skipped.push(
            `${row.name}: consent not recorded (${(err as Error).message})`,
          );
        }
      }
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'buyer.import',
      resource: 'buyers',
      details: {
        source: input.source,
        sourceDetail: input.sourceDetail,
        rows: input.rows.length,
        created,
        updated,
        consents,
        emailConsentBasis: input.emailConsentBasis ?? null,
      },
    });
    return { created, updated, consentsRecorded: consents, skipped };
  }

  private async owned(accountId: string, buyerId: string) {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id: buyerId, accountId },
    });
    if (!buyer) throw new NotFoundException(`Buyer ${buyerId} not found`);
    return buyer;
  }
}
