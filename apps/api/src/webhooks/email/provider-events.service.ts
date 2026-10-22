import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { OptOutService } from '../../compliance/opt-out.service';
import { TimelineService } from '../../timeline/timeline.service';
import { messageCounterparty } from '../../communications/message-counterparty';
import type { ProviderEvent } from './provider-events';

/**
 * What providers report after a send (docs/communications.md s5). Each
 * event is stored once; delivered and failed update the message; a hard
 * bounce suppresses the address; a complaint or provider unsubscribe is an
 * opt-out like any other. Opens and clicks are kept as events only.
 */
@Injectable()
export class ProviderEventsService {
  private readonly logger = new Logger(ProviderEventsService.name);

  constructor(
    private prisma: PrismaService,
    private optOut: OptOutService,
    private timeline: TimelineService,
  ) {}

  async record(events: ProviderEvent[]) {
    let stored = 0;
    let unmatched = 0;
    for (const e of events) {
      const message = await this.findMessage(e);
      if (!message) {
        unmatched += 1;
        continue;
      }
      try {
        await this.prisma.messageEvent.create({
          data: {
            accountId: message.accountId,
            messageId: message.id,
            provider: e.provider,
            event: e.event,
            bounceType: e.bounceType,
            reason: e.reason,
            providerEventId: e.providerEventId,
            occurredAt: e.occurredAt,
          },
        });
      } catch (err) {
        // A retried webhook: already recorded.
        if ((err as { code?: string }).code === 'P2002') continue;
        throw err;
      }
      stored += 1;
      await this.apply(message, e);
    }
    return { received: events.length, stored, unmatched };
  }

  private async findMessage(e: ProviderEvent) {
    const select = {
      id: true,
      accountId: true,
      leadId: true,
      status: true,
      channel: true,
      direction: true,
      metadata: true,
      counterpartyEnc: true,
    } as const;
    if (e.haloMessageId) {
      const m = await this.prisma.message.findUnique({
        where: { id: e.haloMessageId },
        select,
      });
      if (m) return m;
    }
    if (e.providerMessageId) {
      return this.prisma.message.findFirst({
        where: {
          channel: 'email',
          metadata: {
            path: ['providerMessageId'],
            equals: e.providerMessageId,
          },
        },
        select,
      });
    }
    return null;
  }

  private async apply(
    message: {
      id: string;
      accountId: string;
      leadId: string | null;
      status: string;
      metadata: Prisma.JsonValue;
      channel: string;
      direction: string;
      counterpartyEnc: string | null;
    },
    e: ProviderEvent,
  ) {
    const meta = (message.metadata ?? {}) as Record<string, unknown>;
    if (e.event === 'delivered' && message.status === 'sent') {
      await this.prisma.message.update({
        where: { id: message.id },
        data: { status: 'delivered' },
      });
    }
    if (e.event === 'bounce' || e.event === 'dropped') {
      await this.prisma.message.update({
        where: { id: message.id },
        data: {
          status: 'failed',
          metadata: {
            ...meta,
            deliveryError: {
              event: e.event,
              bounceType: e.bounceType,
              reason: e.reason,
            },
          } as Prisma.InputJsonObject,
        },
      });
    }
    const email = messageCounterparty(message as never);
    if (
      email &&
      ((e.event === 'bounce' && e.bounceType === 'hard') ||
        e.event === 'dropped' ||
        e.event === 'complaint' ||
        e.event === 'unsubscribe')
    ) {
      // A complaint or unsubscribe is the recipient saying no; a hard bounce
      // means the address does not exist. Either way nothing more goes to it.
      await this.optOut.recordEmailOptOut({
        accountId: message.accountId,
        email,
        leadId: message.leadId,
        source:
          e.event === 'complaint'
            ? 'complaint'
            : e.event === 'unsubscribe'
              ? 'provider_unsubscribe'
              : 'bounce',
        reason: e.reason ?? `${e.provider} reported ${e.event}`,
      });
      if (
        typeof meta.buyerId === 'string' &&
        (e.event === 'complaint' || e.event === 'unsubscribe')
      ) {
        await this.prisma.buyer.updateMany({
          where: { id: meta.buyerId, accountId: message.accountId },
          data: { status: 'do_not_market' },
        });
      }
    }
    if (e.event !== 'open' && e.event !== 'click' && e.event !== 'processed') {
      await this.timeline.appendEvent({
        tenantId: message.accountId,
        entityType: TimelineEntityType.MESSAGE,
        entityId: message.id,
        eventType: `EMAIL_${e.event.toUpperCase()}`,
        payload: {
          provider: e.provider,
          bounceType: e.bounceType,
          reason: e.reason,
        },
        actorId: null,
        actorType: TimelineActorType.webhook,
      });
    }
  }
}
