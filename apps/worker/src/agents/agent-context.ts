import { prisma } from '../prisma-client';

/**
 * What the Lead Analyst reads. Everything here is non-contact data: the
 * worker holds no PII keys, so phones and emails appear only as "present"
 * flags and sealed provenance payloads are never opened.
 */
export interface LeadAnalystContext {
  lead: {
    id: string;
    status: string;
    score: number | null;
    tags: string[];
    address: { street: string; city: string; state: string; zip: string };
    ownerName: string | null;
    createdAt: string;
    daysInStatus: number;
    hasPhone: boolean;
    hasEmail: boolean;
    dealCount: number;
  };
  properties: Array<{
    address: string;
    city: string;
    state: string;
    zip: string;
    estimatedValue: number | null;
    salePrice: number | null;
  }>;
  sources: Array<{
    provider: string;
    endpoint: string;
    summary: Record<string, unknown>;
  }>;
  enrichment: Record<string, unknown> | null;
  dnc: boolean;
  consents: { sms: boolean; email: boolean };
  timeline: Array<{ at: string; type: string }>;
}

const GLOBAL_ACCOUNT_ID = 'GLOBAL';
const MAX_SUMMARY_KEYS = 25;

export async function loadLeadContext(
  leadId: string,
  accountId: string,
): Promise<LeadAnalystContext | null> {
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, accountId },
    select: {
      id: true,
      status: true,
      score: true,
      tags: true,
      canonicalAddress: true,
      canonicalCity: true,
      canonicalState: true,
      canonicalZip: true,
      canonicalOwner: true,
      canonicalPhoneHash: true,
      canonicalEmailHash: true,
      createdAt: true,
      updatedAt: true,
      properties: {
        select: {
          address: true,
          city: true,
          state: true,
          zip: true,
          estimatedValue: true,
          salePrice: true,
        },
      },
      sourceRecords: {
        select: { provider: true, endpoint: true, response: true },
        orderBy: { createdAt: 'desc' },
        take: 10,
      },
      _count: { select: { deals: true } },
    },
  });
  if (!lead) return null;

  const [enrichment, consents, timeline, dnc] = await Promise.all([
    prisma.leadEnrichmentJob.findFirst({
      where: { leadId },
      orderBy: { startedAt: 'desc' },
      select: { stage: true, metadata: true, totalCostUsd: true },
    }),
    prisma.consent.findMany({
      where: { leadId, revokedAt: null },
      select: { channel: true },
    }),
    prisma.timelineEvent.findMany({
      where: { tenantId: accountId, entityType: 'LEAD', entityId: leadId },
      orderBy: { createdAt: 'desc' },
      take: 15,
      select: { eventType: true, createdAt: true },
    }),
    onDncList(accountId, lead.canonicalPhoneHash, lead.canonicalEmailHash),
  ]);

  const statusSince =
    timeline.find((e) => e.eventType.startsWith('lead.status.'))?.createdAt ??
    lead.updatedAt;

  return {
    lead: {
      id: lead.id,
      status: lead.status,
      score: lead.score,
      tags: lead.tags,
      address: {
        street: lead.canonicalAddress ?? '',
        city: lead.canonicalCity ?? '',
        state: lead.canonicalState ?? '',
        zip: lead.canonicalZip ?? '',
      },
      ownerName: lead.canonicalOwner,
      createdAt: lead.createdAt.toISOString(),
      daysInStatus: Math.max(
        0,
        Math.floor((Date.now() - statusSince.getTime()) / 86_400_000),
      ),
      hasPhone: !!lead.canonicalPhoneHash,
      hasEmail: !!lead.canonicalEmailHash,
      dealCount: lead._count.deals,
    },
    properties: lead.properties,
    sources: lead.sourceRecords.map((r) => ({
      provider: r.provider,
      endpoint: r.endpoint,
      summary: summarizeSource(r.provider, r.response),
    })),
    enrichment: enrichment
      ? {
          stage: enrichment.stage,
          totalCostUsd: enrichment.totalCostUsd,
          ...scalarsOf(enrichment.metadata, 3),
        }
      : null,
    dnc,
    consents: {
      sms: consents.some((c) => c.channel === 'sms'),
      email: consents.some((c) => c.channel === 'email'),
    },
    timeline: timeline.map((e) => ({
      at: e.createdAt.toISOString(),
      type: e.eventType,
    })),
  };
}

async function onDncList(
  accountId: string,
  phoneHash: string | null,
  emailHash: string | null,
): Promise<boolean> {
  const byContact: Array<Record<string, unknown>> = [];
  for (const tenant of [accountId, GLOBAL_ACCOUNT_ID]) {
    if (phoneHash) byContact.push({ accountId: tenant, phoneHash });
    if (emailHash) byContact.push({ accountId: tenant, emailHash });
  }
  if (byContact.length === 0) return false;
  const hit = await prisma.dNCList.findFirst({
    where: {
      OR: byContact,
      AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
    },
    select: { id: true },
  });
  return !!hit;
}

/**
 * A compact, contact-free view of one provenance record. ATTOM profiles are
 * large and nested, so the fields that matter are picked out; other
 * providers' records are reduced to their scalar fields, minus anything
 * sealed.
 */
export function summarizeSource(
  provider: string,
  response: unknown,
): Record<string, unknown> {
  const r = obj(response);
  if (provider === 'attom') return summarizeAttom(r);
  const rest = Object.fromEntries(
    Object.entries(r).filter(([key]) => key !== 'sealedPii'),
  );
  return scalarsOf(rest, 1);
}

function summarizeAttom(r: Record<string, unknown>): Record<string, unknown> {
  const p = obj(arr(r.property)[0] ?? r);
  const summary = obj(p.summary);
  const building = obj(p.building);
  const rooms = obj(building.rooms);
  const size = obj(building.size);
  const assessment = obj(p.assessment);
  const sale = obj(p.sale);
  const absentee = str(summary.absenteeInd);
  return compact({
    propertyType: str(summary.proptype) ?? str(summary.propclass),
    yearBuilt: num(summary.yearbuilt),
    beds: num(rooms.beds),
    baths: num(rooms.bathstotal),
    sqft: num(size.universalsize) ?? num(size.livingsize),
    assessedValue: num(obj(assessment.assessed).assdttlvalue),
    marketValue: num(obj(assessment.market).mktttlvalue),
    lastSaleAmount: num(obj(sale.amount).saleamt),
    lastSaleDate: str(sale.saleTransDate) ?? str(obj(sale.amount).salerecdate),
    absenteeIndicator: absentee,
    ownerOccupied: absentee ? /owner\s*occupied/i.test(absentee) : undefined,
  });
}

/** Scalar fields of an object (one level, or `depth` levels for nested step results). */
export function scalarsOf(
  value: unknown,
  depth: number,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  let keys = 0;
  for (const [k, v] of Object.entries(obj(value))) {
    if (keys >= MAX_SUMMARY_KEYS) break;
    if (k === 'sealedPii') continue;
    if (v === null || ['string', 'number', 'boolean'].includes(typeof v)) {
      out[k] = typeof v === 'string' ? v.slice(0, 160) : v;
      keys++;
    } else if (depth > 1 && v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = scalarsOf(v, depth - 1);
      keys++;
    }
  }
  return out;
}

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : null;
const num = (v: unknown): number | null => {
  const n =
    typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
function compact(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== null && v !== undefined),
  );
}
