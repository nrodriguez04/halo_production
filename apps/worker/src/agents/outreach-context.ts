import type { AgentJobPayload, AgentTrigger } from '@halo/shared';
import { prisma } from '../prisma-client';
import { onDncList } from './agent-context';

const THREAD_TAKE = 20;
const MAX_CONTENT_CHARS = 600;

/**
 * What the Outreach Drafter reads (design doc s3.3): the thread, the deal
 * and lead facts that shape a reply, and the compliance facts that decide
 * whether there should be one. Contact details stay sealed: the worker sees
 * message text and present/absent flags, never a number or an address.
 */
export interface OutreachContext {
  trigger: AgentTrigger;
  entity: { type: 'deal' | 'lead'; id: string };
  deal: {
    id: string;
    stage: string;
    arv: number | null;
    mao: number | null;
    offerAmount: number | null;
    createdAt: string;
  } | null;
  lead: {
    id: string;
    status: string;
    score: number | null;
    tags: string[];
    ownerName: string | null;
    hasPhone: boolean;
    hasEmail: boolean;
  } | null;
  property: { address: string; city: string; state: string; zip: string } | null;
  compliance: { dnc: boolean; consents: { sms: boolean; email: boolean } };
  thread: Array<{
    id: string;
    direction: string;
    channel: string;
    status: string;
    at: string;
    content: string;
  }>;
  /** The reply that fired an inbound trigger, when there is one. */
  inbound: { id: string; channel: 'sms' | 'email'; content: string; at: string } | null;
  followUps: {
    outboundSinceLastInbound: number;
    lastOutboundAt: string | null;
    lastInboundAt: string | null;
  };
  team: { name: string | null };
}

const leadSelect = {
  id: true,
  status: true,
  score: true,
  tags: true,
  canonicalOwner: true,
  canonicalPhoneHash: true,
  canonicalEmailHash: true,
} as const;
const dealSelect = {
  id: true,
  stage: true,
  arv: true,
  mao: true,
  offerAmount: true,
  createdAt: true,
} as const;
const propertySelect = { address: true, city: true, state: true, zip: true } as const;

export async function loadOutreachContext(
  p: Pick<AgentJobPayload, 'accountId' | 'entityType' | 'entityId' | 'trigger' | 'messageId'>,
): Promise<OutreachContext | null> {
  let deal: Record<string, unknown> | null = null;
  let lead: Record<string, unknown> | null = null;
  let property: OutreachContext['property'] = null;

  if (p.entityType === 'deal') {
    const row = await prisma.deal.findFirst({
      where: { id: p.entityId, accountId: p.accountId },
      select: {
        ...dealSelect,
        lead: { select: leadSelect },
        property: { select: propertySelect },
      },
    });
    if (!row) return null;
    const { lead: l, property: pr, ...d } = row;
    deal = d;
    lead = l;
    property = pr;
  } else if (p.entityType === 'lead') {
    const row = await prisma.lead.findFirst({
      where: { id: p.entityId, accountId: p.accountId },
      select: {
        ...leadSelect,
        deals: {
          where: { stage: { not: 'lost' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: dealSelect,
        },
        properties: { select: propertySelect, take: 1 },
      },
    });
    if (!row) return null;
    const { deals, properties, ...l } = row;
    lead = l;
    deal = deals[0] ?? null;
    property = properties[0] ?? null;
  } else {
    return null;
  }

  const leadId = lead ? (lead.id as string) : null;
  const dealId = deal ? (deal.id as string) : null;
  const threadWhere = [
    ...(leadId ? [{ leadId }] : []),
    ...(dealId ? [{ dealId }] : []),
  ];
  const [messages, consents, dnc, account] = await Promise.all([
    threadWhere.length
      ? prisma.message.findMany({
          where: { accountId: p.accountId, OR: threadWhere },
          orderBy: { createdAt: 'desc' },
          take: THREAD_TAKE,
          select: {
            id: true,
            direction: true,
            channel: true,
            status: true,
            content: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    leadId
      ? prisma.consent.findMany({
          where: { leadId, revokedAt: null },
          select: { channel: true },
        })
      : Promise.resolve([]),
    lead
      ? onDncList(
          p.accountId,
          (lead.canonicalPhoneHash as string | null) ?? null,
          (lead.canonicalEmailHash as string | null) ?? null,
        )
      : Promise.resolve(false),
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
      content: m.content.slice(0, MAX_CONTENT_CHARS),
    }));

  let inbound: OutreachContext['inbound'] = null;
  if (p.messageId) {
    const inThread = thread.find((m) => m.id === p.messageId);
    const row =
      inThread ??
      (await prisma.message
        .findFirst({
          where: { id: p.messageId, accountId: p.accountId, direction: 'inbound' },
          select: { id: true, channel: true, content: true, createdAt: true },
        })
        .then((m) =>
          m
            ? {
                id: m.id,
                channel: m.channel,
                content: m.content.slice(0, MAX_CONTENT_CHARS),
                at: m.createdAt.toISOString(),
              }
            : null,
        ));
    if (row) {
      inbound = {
        id: row.id,
        channel: row.channel === 'email' ? 'email' : 'sms',
        content: row.content,
        at: row.at,
      };
    }
  }

  let outboundSinceLastInbound = 0;
  let lastOutboundAt: string | null = null;
  let lastInboundAt: string | null = null;
  for (const m of thread) {
    if (m.direction === 'inbound') {
      lastInboundAt = m.at;
      outboundSinceLastInbound = 0;
    } else if (['sent', 'delivered'].includes(m.status)) {
      lastOutboundAt = m.at;
      outboundSinceLastInbound += 1;
    }
  }

  return {
    trigger: p.trigger,
    entity: { type: p.entityType, id: p.entityId },
    deal: deal
      ? {
          id: deal.id as string,
          stage: deal.stage as string,
          arv: (deal.arv as number | null) ?? null,
          mao: (deal.mao as number | null) ?? null,
          offerAmount: (deal.offerAmount as number | null) ?? null,
          createdAt: (deal.createdAt as Date).toISOString(),
        }
      : null,
    lead: lead
      ? {
          id: lead.id as string,
          status: lead.status as string,
          score: (lead.score as number | null) ?? null,
          tags: (lead.tags as string[]) ?? [],
          ownerName: (lead.canonicalOwner as string | null) ?? null,
          hasPhone: !!lead.canonicalPhoneHash,
          hasEmail: !!lead.canonicalEmailHash,
        }
      : null,
    property,
    compliance: {
      dnc,
      consents: {
        sms: consents.some((c) => c.channel === 'sms'),
        email: consents.some((c) => c.channel === 'email'),
      },
    },
    thread,
    inbound,
    followUps: { outboundSinceLastInbound, lastOutboundAt, lastInboundAt },
    team: { name: account?.name ?? null },
  };
}
