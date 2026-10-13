import {
  assignmentFeeFor,
  type AgentJobPayload,
  type AgentTrigger,
} from '@halo/shared';
import { prisma } from '../prisma-client';
import { onDncList } from './agent-context';

const THREAD_TAKE = 16;
const MAX_CONTENT_CHARS = 800;

/**
 * What the Buyer Responder reads: the deal as a buyer sees it, the buyer's
 * buy box, and this buyer's thread on this deal. The seller-side numbers
 * (offer, contract price, MAO) are here so the buyer price can be worked
 * out and checked, but the agent never shows them to the model. Contacts
 * stay sealed: the worker sees message text and present / absent flags.
 */
export interface BuyerReplyContext {
  trigger: AgentTrigger;
  deal: {
    id: string;
    stage: string;
    arv: number | null;
    repairEstimate: number | null;
    /** Seller side: never shown to a buyer. */
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
  buyer: {
    id: string;
    name: string;
    preferences: Record<string, unknown> | null;
    engagementScore: number;
    hasEmail: boolean;
    hasPhone: boolean;
  } | null;
  /** The buyer asked not to be contacted (DNC by phone or email). */
  compliance: { optedOut: boolean };
  thread: Array<{
    id: string;
    direction: string;
    channel: string;
    status: string;
    at: string;
    subject: string | null;
    content: string;
  }>;
  /** The reply that fired the run. */
  inbound: {
    id: string;
    channel: 'sms' | 'email';
    subject: string | null;
    content: string;
    at: string;
  } | null;
  team: { name: string | null };
}

const subjectOf = (metadata: unknown): string | null => {
  const s = (metadata as Record<string, unknown> | null)?.subject;
  return typeof s === 'string' && s.trim() ? s.trim().slice(0, 200) : null;
};

export async function loadBuyerReplyContext(
  p: Pick<
    AgentJobPayload,
    'accountId' | 'entityType' | 'entityId' | 'trigger' | 'messageId'
  >,
): Promise<BuyerReplyContext | null> {
  if (p.entityType !== 'deal') return null;
  const deal = await prisma.deal.findFirst({
    where: { id: p.entityId, accountId: p.accountId },
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
    },
  });
  if (!deal) return null;

  const inboundRow = p.messageId
    ? await prisma.message.findFirst({
        where: {
          id: p.messageId,
          accountId: p.accountId,
          direction: 'inbound',
        },
        select: {
          id: true,
          channel: true,
          content: true,
          createdAt: true,
          metadata: true,
          counterpartyHash: true,
        },
      })
    : null;

  // The webhook names the buyer on the message; the sender's blind index is
  // the fallback for replies recorded before it did.
  const buyerId = (inboundRow?.metadata as Record<string, unknown> | null)
    ?.buyerId;
  const buyerSelect = {
    id: true,
    name: true,
    preferences: true,
    engagementScore: true,
    emailHash: true,
    phoneHash: true,
  } as const;
  const buyer =
    typeof buyerId === 'string'
      ? await prisma.buyer.findFirst({
          where: { id: buyerId, accountId: p.accountId },
          select: buyerSelect,
        })
      : inboundRow?.counterpartyHash
        ? await prisma.buyer.findFirst({
            where: {
              accountId: p.accountId,
              OR: [
                { emailHash: inboundRow.counterpartyHash },
                { phoneHash: inboundRow.counterpartyHash },
              ],
            },
            select: buyerSelect,
          })
        : null;

  const hashes = Array.from(
    new Set(
      [buyer?.emailHash, buyer?.phoneHash, inboundRow?.counterpartyHash].filter(
        (h): h is string => !!h,
      ),
    ),
  );
  const [messages, optedOut, controlPlane, account] = await Promise.all([
    hashes.length
      ? prisma.message.findMany({
          where: {
            accountId: p.accountId,
            dealId: deal.id,
            counterpartyHash: { in: hashes },
          },
          orderBy: { createdAt: 'desc' },
          take: THREAD_TAKE,
          select: {
            id: true,
            direction: true,
            channel: true,
            status: true,
            content: true,
            createdAt: true,
            metadata: true,
          },
        })
      : Promise.resolve([]),
    buyer
      ? onDncList(p.accountId, buyer.phoneHash, buyer.emailHash)
      : Promise.resolve(false),
    prisma.controlPlane.findUnique({
      where: { accountId: p.accountId },
      select: { defaultAssignmentFee: true },
    }),
    prisma.account.findUnique({
      where: { id: p.accountId },
      select: { name: true },
    }),
  ]);

  const thread = messages
    .slice()
    .reverse()
    .map((m) => ({
      id: m.id,
      direction: m.direction,
      channel: m.channel,
      status: m.status,
      at: m.createdAt.toISOString(),
      subject: subjectOf(m.metadata),
      content: m.content.slice(0, MAX_CONTENT_CHARS),
    }));

  return {
    trigger: p.trigger,
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
    buyer: buyer
      ? {
          id: buyer.id,
          name: buyer.name,
          preferences:
            (buyer.preferences as Record<string, unknown> | null) ?? null,
          engagementScore: buyer.engagementScore,
          hasEmail: !!buyer.emailHash,
          hasPhone: !!buyer.phoneHash,
        }
      : null,
    compliance: { optedOut },
    thread,
    inbound: inboundRow
      ? {
          id: inboundRow.id,
          channel: inboundRow.channel === 'sms' ? 'sms' : 'email',
          subject: subjectOf(inboundRow.metadata),
          content: inboundRow.content.slice(0, MAX_CONTENT_CHARS),
          at: inboundRow.createdAt.toISOString(),
        }
      : null,
    team: { name: account?.name ?? null },
  };
}
