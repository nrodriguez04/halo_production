import { assignmentFeeFor } from '@halo/shared';
import { prisma } from '../prisma-client';
import { scalarsOf } from './agent-context';

const MAX_BUYERS = 300;
const MAX_HISTORY_ROWS = 4000;

/**
 * What the Disposition Matcher reads (design doc s3.4): the deal's numbers,
 * the property, every buyer's stated buy box and how they have behaved
 * with us so far. Buyer contacts stay sealed: the worker sees present /
 * absent flags and counts keyed by blind index, never an address.
 */
export interface DispositionBuyer {
  id: string;
  name: string;
  preferences: Record<string, unknown> | null;
  engagementScore: number;
  lastContacted: string | null;
  hasEmail: boolean;
  hasPhone: boolean;
  history: { sent: number; replies: number; lastReplyAt: string | null };
}

export interface DispositionContext {
  deal: {
    id: string;
    stage: string;
    arv: number | null;
    repairEstimate: number | null;
    /** Seller side: the most we would pay and the offer made. Never shown to buyers. */
    mao: number | null;
    offerAmount: number | null;
    /** Set by a person on the deal's economics, when they were. */
    contractPrice: number | null;
    assignmentPrice: number | null;
    assignmentFee: number | null;
  };
  /** The tenant's wholesale fee (control plane). */
  defaultAssignmentFee: number;
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    estimatedValue: number | null;
  } | null;
  underwriting: {
    confidence: number | null;
    offerRange: Record<string, unknown> | null;
    rationale: string | null;
  } | null;
  buyers: DispositionBuyer[];
  priorBlasts: Array<{ at: string; buyerIds: string[] }>;
  team: { name: string | null };
}

export async function loadDispositionContext(
  dealId: string,
  accountId: string,
): Promise<DispositionContext | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, accountId },
    select: {
      id: true,
      stage: true,
      arv: true,
      repairEstimate: true,
      mao: true,
      offerAmount: true,
      economics: {
        select: {
          contractPrice: true,
          assignmentPrice: true,
          assignmentFee: true,
        },
      },
      property: {
        select: {
          address: true,
          city: true,
          state: true,
          zip: true,
          estimatedValue: true,
        },
      },
      underwritingResult: {
        select: { confidence: true, rationale: true, evaluationMetadata: true },
      },
    },
  });
  if (!deal) return null;

  const [buyers, blasts, account, controlPlane] = await Promise.all([
    prisma.buyer.findMany({
      where: { accountId },
      orderBy: { engagementScore: 'desc' },
      take: MAX_BUYERS,
      select: {
        id: true,
        name: true,
        preferences: true,
        engagementScore: true,
        lastContacted: true,
        emailHash: true,
        phoneHash: true,
      },
    }),
    prisma.marketingMaterial.findMany({
      where: { dealId, type: 'buyer_blast' },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { createdAt: true, metadata: true },
    }),
    prisma.account.findUnique({
      where: { id: accountId },
      select: { name: true },
    }),
    prisma.controlPlane.findUnique({
      where: { accountId },
      select: { defaultAssignmentFee: true },
    }),
  ]);

  // Past behaviour by blind index: how often we wrote to each buyer and how
  // often they wrote back. No contact value is ever opened here.
  const hashes = Array.from(
    new Set(
      buyers.flatMap((b) => [b.emailHash, b.phoneHash]).filter(Boolean),
    ),
  ) as string[];
  const history = new Map<
    string,
    { sent: number; replies: number; lastReplyAt: Date | null }
  >();
  if (hashes.length > 0) {
    const rows = await prisma.message.findMany({
      where: { accountId, counterpartyHash: { in: hashes } },
      orderBy: { createdAt: 'desc' },
      take: MAX_HISTORY_ROWS,
      select: {
        counterpartyHash: true,
        direction: true,
        status: true,
        createdAt: true,
      },
    });
    for (const row of rows) {
      const key = row.counterpartyHash as string;
      const h = history.get(key) ?? { sent: 0, replies: 0, lastReplyAt: null };
      if (row.direction === 'inbound') {
        h.replies += 1;
        if (!h.lastReplyAt || row.createdAt > h.lastReplyAt) {
          h.lastReplyAt = row.createdAt;
        }
      } else if (['sent', 'delivered'].includes(row.status)) {
        h.sent += 1;
      }
      history.set(key, h);
    }
  }
  const historyFor = (b: { emailHash: string | null; phoneHash: string | null }) => {
    const parts = [b.emailHash, b.phoneHash]
      .filter((h): h is string => !!h)
      .map((h) => history.get(h))
      .filter((h): h is NonNullable<typeof h> => !!h);
    const lastReply = parts
      .map((h) => h.lastReplyAt)
      .filter((d): d is Date => !!d)
      .sort((a, b) => b.getTime() - a.getTime())[0];
    return {
      sent: parts.reduce((n, h) => n + h.sent, 0),
      replies: parts.reduce((n, h) => n + h.replies, 0),
      lastReplyAt: lastReply ? lastReply.toISOString() : null,
    };
  };

  const meta = scalarsOf(deal.underwritingResult?.evaluationMetadata, 2);
  return {
    deal: {
      id: deal.id,
      stage: deal.stage,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      mao: deal.mao,
      offerAmount: deal.offerAmount,
      contractPrice: deal.economics?.contractPrice ?? null,
      assignmentPrice: deal.economics?.assignmentPrice ?? null,
      assignmentFee: deal.economics?.assignmentFee ?? null,
    },
    defaultAssignmentFee: assignmentFeeFor(
      null,
      controlPlane?.defaultAssignmentFee,
    ),
    property: deal.property,
    underwriting: deal.underwritingResult
      ? {
          confidence: deal.underwritingResult.confidence,
          offerRange:
            (meta.offerRange as Record<string, unknown> | undefined) ?? null,
          rationale: deal.underwritingResult.rationale?.slice(0, 400) ?? null,
        }
      : null,
    buyers: buyers.map((b) => ({
      id: b.id,
      name: b.name,
      preferences: (b.preferences as Record<string, unknown> | null) ?? null,
      engagementScore: b.engagementScore,
      lastContacted: b.lastContacted ? b.lastContacted.toISOString() : null,
      hasEmail: !!b.emailHash,
      hasPhone: !!b.phoneHash,
      history: historyFor(b),
    })),
    priorBlasts: blasts.map((m) => ({
      at: m.createdAt.toISOString(),
      buyerIds: Array.isArray((m.metadata as Record<string, unknown>)?.buyerIds)
        ? ((m.metadata as Record<string, unknown>).buyerIds as string[])
        : [],
    })),
    team: { name: account?.name ?? null },
  };
}
