import { Injectable } from '@nestjs/common';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { OptOutService } from '../compliance/opt-out.service';
import { TimelineService } from '../timeline/timeline.service';
import { messageCounterparty } from './message-counterparty';
import { verifyUnsubscribeToken } from './unsubscribe-token';

export type UnsubscribeOutcome = 'unsubscribed' | 'invalid';

/**
 * The email side of opt-out: the link in every outbound email names its
 * message, and the message's stored recipient goes on the tenant's DNC
 * list (email entries now apply to email sends) with its email consents
 * revoked. The address itself never appears in the link.
 */
@Injectable()
export class UnsubscribeService {
  constructor(
    private prisma: PrismaService,
    private optOut: OptOutService,
    private timeline: TimelineService,
  ) {}

  isValid(token: string): boolean {
    return verifyUnsubscribeToken(token) !== null;
  }

  async unsubscribe(token: string): Promise<UnsubscribeOutcome> {
    const messageId = verifyUnsubscribeToken(token);
    if (!messageId) return 'invalid';

    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        accountId: true,
        leadId: true,
        channel: true,
        direction: true,
        metadata: true,
        counterpartyEnc: true,
      },
    });
    if (
      !message ||
      message.channel !== 'email' ||
      message.direction !== 'outbound'
    ) {
      return 'invalid';
    }
    const email = messageCounterparty(message);
    if (!email) return 'invalid';

    await this.optOut.recordEmailOptOut({
      accountId: message.accountId,
      email,
      leadId: message.leadId,
      source: 'unsubscribe_link',
      reason: 'Unsubscribed via email link',
    });
    await this.timeline.appendEvent({
      tenantId: message.accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: message.id,
      eventType: 'RECIPIENT_UNSUBSCRIBED',
      payload: { channel: 'email', source: 'unsubscribe_link' },
      actorId: null,
      actorType: TimelineActorType.webhook,
    });
    return 'unsubscribed';
  }
}
