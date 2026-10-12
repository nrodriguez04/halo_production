import { prisma } from '../prisma-client';
import { scalarsOf, summarizeSource } from './agent-context';

/**
 * What the Deal Underwriter reads (design doc s3.2): the deal's numbers so
 * far, the property, the provenance records behind it, the lead's
 * non-contact facts and the prior result. No contact data: numbers never
 * need a phone number.
 */
export interface DealUnderwriterContext {
  deal: {
    id: string;
    stage: string;
    arv: number | null;
    repairEstimate: number | null;
    mao: number | null;
    offerAmount: number | null;
    createdAt: string;
    /** Snapshot the api compares against before writing numbers back. */
    updatedAt: string;
  };
  property: {
    address: string;
    city: string;
    state: string;
    zip: string;
    apn: string | null;
    estimatedValue: number | null;
    salePrice: number | null;
  } | null;
  lead: { status: string; score: number | null; tags: string[] } | null;
  sources: Array<{
    provider: string;
    endpoint: string;
    summary: Record<string, unknown>;
  }>;
  priorResult: {
    arv: number | null;
    repairEstimate: number | null;
    mao: number | null;
    confidence: number | null;
    rationale: string | null;
    updatedAt: string;
    metadata: Record<string, unknown>;
  } | null;
  timeline: Array<{ at: string; type: string }>;
}

export async function loadDealContext(
  dealId: string,
  accountId: string,
): Promise<DealUnderwriterContext | null> {
  const deal = await prisma.deal.findFirst({
    where: { id: dealId, accountId },
    select: {
      id: true,
      stage: true,
      arv: true,
      repairEstimate: true,
      mao: true,
      offerAmount: true,
      createdAt: true,
      updatedAt: true,
      property: {
        select: {
          address: true,
          city: true,
          state: true,
          zip: true,
          apn: true,
          estimatedValue: true,
          salePrice: true,
          sourceRecords: {
            select: { provider: true, endpoint: true, response: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
      lead: {
        select: {
          status: true,
          score: true,
          tags: true,
          sourceRecords: {
            select: { provider: true, endpoint: true, response: true },
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      },
      underwritingResult: {
        select: {
          arv: true,
          repairEstimate: true,
          mao: true,
          confidence: true,
          rationale: true,
          updatedAt: true,
          evaluationMetadata: true,
        },
      },
    },
  });
  if (!deal) return null;

  const timeline = await prisma.timelineEvent.findMany({
    where: { tenantId: accountId, entityType: 'DEAL', entityId: dealId },
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: { eventType: true, createdAt: true },
  });

  const { sourceRecords: propertyRecords, ...property } = deal.property ?? {
    sourceRecords: [],
  };
  const { sourceRecords: leadRecords, ...lead } = deal.lead ?? {
    sourceRecords: [],
  };
  const seen = new Set<string>();
  const sources = [...propertyRecords, ...leadRecords]
    .filter((r) => {
      const key = `${r.provider}|${r.endpoint}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      provider: r.provider,
      endpoint: r.endpoint,
      summary: summarizeSource(r.provider, r.response),
    }));

  return {
    deal: {
      id: deal.id,
      stage: deal.stage,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
      mao: deal.mao,
      offerAmount: deal.offerAmount,
      createdAt: deal.createdAt.toISOString(),
      updatedAt: deal.updatedAt.toISOString(),
    },
    property: deal.property
      ? (property as DealUnderwriterContext['property'])
      : null,
    lead: deal.lead ? (lead as DealUnderwriterContext['lead']) : null,
    sources,
    priorResult: deal.underwritingResult
      ? {
          arv: deal.underwritingResult.arv,
          repairEstimate: deal.underwritingResult.repairEstimate,
          mao: deal.underwritingResult.mao,
          confidence: deal.underwritingResult.confidence,
          rationale: deal.underwritingResult.rationale,
          updatedAt: deal.underwritingResult.updatedAt.toISOString(),
          metadata: scalarsOf(deal.underwritingResult.evaluationMetadata, 2),
        }
      : null,
    timeline: timeline.map((e) => ({
      at: e.createdAt.toISOString(),
      type: e.eventType,
    })),
  };
}
