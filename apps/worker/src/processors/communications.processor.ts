import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { assertPolicy } from '@halo/shared';
import { prisma } from '../prisma-client';
import { getControlPlane } from '../control-plane';
import {
  ComplianceBlockedError,
  CostBlockedError,
  sendEmail as sendEmailViaApi,
  sendSms as sendSmsViaApi,
} from '../internal-api.client';

@Processor('communications')
export class CommunicationsProcessor extends WorkerHost {
  // No SDK clients here on purpose: outbound sends go through the api's
  // /internal routes so the cost-control preflight, budget buckets and
  // ledger apply. Re-adding `new Twilio(...)` here would silently restore
  // uncapped spend.

  async process(job: Job<any>) {
    const { messageId } = job.data;

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      if (message.status !== 'approved') {
        throw new Error(`Message ${messageId} is not approved`);
      }

      // Check control plane
      const controlPlane = await getControlPlane(message.accountId);
      if (!controlPlane.enabled) {
        throw new Error('Communications are disabled');
      }

      assertPolicy({
        tenantId: message.accountId,
        actorId: null,
        actorType: 'system',
        now: new Date(),
        requestedAction:
          message.channel === 'sms' ? 'comms.send_sms' : 'comms.send_email',
        channel: message.channel === 'sms' ? 'sms' : 'email',
        messageId,
        sideEffectsEnabled: controlPlane.enabled,
        messagingEnabled:
          message.channel === 'sms'
            ? controlPlane.smsEnabled
            : controlPlane.emailEnabled,
      });

      if (message.channel === 'sms') {
        if (!controlPlane.smsEnabled) {
          throw new Error('SMS is disabled');
        }
        await this.sendSMS(message);
      } else if (message.channel === 'email') {
        if (!controlPlane.emailEnabled) {
          throw new Error('Email is disabled');
        }
        await this.sendEmail(message);
      }

      // Update message status
      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: 'sent',
          sentAt: new Date(),
        },
      });

      await prisma.timelineEvent.create({
        data: {
          tenantId: message.accountId,
          entityType: TimelineEntityType.MESSAGE,
          entityId: messageId,
          eventType: 'MESSAGE_SENT',
          payloadJson: { channel: message.channel },
          actorId: null,
          actorType: TimelineActorType.system,
        },
      });

      return { success: true, messageId };
    } catch (error) {
      // A budget block is not a delivery failure. Retrying it would just
      // hammer an exhausted cap, so park the message in `blocked` and let
      // the job succeed; it can be re-queued once budget frees up.
      if (error instanceof ComplianceBlockedError) {
        console.warn(
          `Communication ${messageId} blocked by compliance (${error.reason})`,
        );
        const blocked = await prisma.message.update({
          where: { id: messageId },
          data: { status: 'blocked' },
        });
        await prisma.timelineEvent.create({
          data: {
            tenantId: blocked.accountId,
            entityType: TimelineEntityType.MESSAGE,
            entityId: messageId,
            eventType: 'MESSAGE_SEND_BLOCKED',
            payloadJson: {
              reason: error.reason,
              message: error.message,
              blockedBy: 'compliance',
            },
            actorId: null,
            actorType: TimelineActorType.system,
          },
        });
        return { success: false, messageId, blocked: true, reason: error.reason };
      }

      if (error instanceof CostBlockedError) {
        console.warn(
          `Communication ${messageId} blocked by cost control (${error.reason}, provider=${error.provider})`,
        );
        const blockedMessage = await prisma.message.update({
          where: { id: messageId },
          data: { status: 'blocked' },
        });
        await prisma.timelineEvent.create({
          data: {
            tenantId: blockedMessage.accountId,
            entityType: TimelineEntityType.MESSAGE,
            entityId: messageId,
            eventType: 'MESSAGE_SEND_BLOCKED',
            payloadJson: {
              reason: error.reason,
              provider: error.provider,
              message: error.message,
            },
            actorId: null,
            actorType: TimelineActorType.system,
          },
        });
        return { success: false, messageId, blocked: true, reason: error.reason };
      }

      console.error(`Communication send failed for ${messageId}:`, error);
      
      // Update message status to failed
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'failed' },
      });

      const failedMessage = await prisma.message.findUnique({
        where: { id: messageId },
      });
      if (failedMessage) {
        await prisma.timelineEvent.create({
          data: {
            tenantId: failedMessage.accountId,
            entityType: TimelineEntityType.MESSAGE,
            entityId: messageId,
            eventType: 'MESSAGE_SEND_FAILED',
            payloadJson: { error: (error as Error).message },
            actorId: null,
            actorType: TimelineActorType.system,
          },
        });
      }

      throw error;
    }
  }

  private async sendSMS(message: any) {
    const metadata = (message.metadata as any) || {};
    const to = metadata.phone || metadata.to;
    if (!to) throw new Error('No recipient phone number');

    const from = process.env.TWILIO_PHONE_NUMBER;
    if (!from) throw new Error('TWILIO_PHONE_NUMBER is required');

    const result = await sendSmsViaApi(message.accountId, {
      to,
      from,
      body: message.content,
      // Idempotency key on the api side, so a BullMQ retry cannot double-send.
      messageId: message.id,
      dealId: message.dealId ?? undefined,
      leadId: message.leadId ?? undefined,
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          twilioMessageSid: result?.sid,
          numSegments: result?.numSegments,
        },
      },
    });
  }

  private async sendEmail(message: any) {
    const metadata = (message.metadata as any) || {};
    const to = metadata.email || metadata.to;
    if (!to) throw new Error('No recipient email address');

    await sendEmailViaApi(message.accountId, {
      to,
      subject: metadata.subject || 'Message from Hālo',
      text: message.content,
      html: message.content.replace(/\n/g, '<br>'),
      messageId: message.id,
      dealId: message.dealId ?? undefined,
      leadId: message.leadId ?? undefined,
    });
  }
}
