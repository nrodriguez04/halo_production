import { Injectable } from '@nestjs/common';
import {
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TimelineService {
  constructor(private prisma: PrismaService) {}

  async appendEvent(input: {
    tenantId: string;
    entityType: TimelineEntityType;
    entityId: string;
    eventType: string;
    payload?: Record<string, any>;
    actorId?: string | null;
    actorType: TimelineActorType;
  }) {
    return this.prisma.timelineEvent.create({
      data: {
        tenantId: input.tenantId,
        entityType: input.entityType,
        entityId: input.entityId,
        eventType: input.eventType,
        payloadJson: input.payload || {},
        actorId: input.actorId || null,
        actorType: input.actorType,
      },
    });
  }

  async getEntityTimeline(
    tenantId: string,
    entityType: TimelineEntityType,
    entityId: string,
    limit = 100,
  ) {
    return this.prisma.timelineEvent.findMany({
      where: {
        tenantId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
