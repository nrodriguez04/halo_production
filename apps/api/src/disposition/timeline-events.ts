import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import type { TimelineService } from '../timeline/timeline.service';

/**
 * One timeline event on a deal, by a person when there is one and the
 * system otherwise. Every contract-flipping state change writes one, so the
 * deal's history is its audit trail.
 */
export function dealEvent(
  timeline: TimelineService,
  accountId: string,
  dealId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorId: string | null,
  actorType?: TimelineActorType,
) {
  return timeline.appendEvent({
    tenantId: accountId,
    entityType: TimelineEntityType.DEAL,
    entityId: dealId,
    eventType,
    payload,
    actorId,
    actorType:
      actorType ??
      (actorId ? TimelineActorType.user : TimelineActorType.system),
  });
}

export function buyerEvent(
  timeline: TimelineService,
  accountId: string,
  buyerId: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorId: string | null,
  actorType?: TimelineActorType,
) {
  return timeline.appendEvent({
    tenantId: accountId,
    entityType: TimelineEntityType.BUYER,
    entityId: buyerId,
    eventType,
    payload,
    actorId,
    actorType:
      actorType ??
      (actorId ? TimelineActorType.user : TimelineActorType.system),
  });
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / DAY_MS);
}
