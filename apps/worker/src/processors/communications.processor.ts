import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { Twilio } from 'twilio';
import * as nodemailer from 'nodemailer';
import { assertPolicy } from '@halo/shared';
import { prisma } from '../prisma-client';

@Processor('communications')
export class CommunicationsProcessor extends WorkerHost {
  private twilioClient: Twilio | null = null;
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    super();
    
    // Initialize Twilio
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = new Twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
      );
    }

    // Initialize email transporter
    const useSendGrid = process.env.NODE_ENV === 'production' || process.env.USE_SENDGRID === 'true';
    
    if (useSendGrid && process.env.SENDGRID_API_KEY) {
      // SendGrid setup would go here
      // For now, use MailHog in dev
    } else {
      // MailHog for dev
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'localhost',
        port: parseInt(process.env.SMTP_PORT || '1025'),
        secure: false,
      });
    }
  }

  async process(job: Job<any>) {
    const { messageId } = job.data;

    try {
      const message = await prisma.message.findUnique({
        where: { id: messageId },
      });

      if (!message) {
        throw new Error(`Message ${messageId} not found`);
      }

      if (message.status === 'sent' || message.status === 'delivered') {
        return { success: true, messageId, alreadySent: true };
      }

      if (await this.recoverPersistedDelivery(message)) {
        return { success: true, messageId, recovered: true };
      }

      if (message.status !== 'approved') {
        throw new Error(`Message ${messageId} is not approved`);
      }

      // Check control plane
      const controlPlane = await prisma.controlPlane.findFirst();
      if (!controlPlane?.enabled) {
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

      await this.markMessageSent(message);

      return { success: true, messageId };
    } catch (error) {
      console.error(`Communication send failed for ${messageId}:`, error);

      try {
        if (await this.recoverFromPersistedDelivery(messageId)) {
          return { success: true, messageId, recovered: true };
        }
      } catch (recoveryError) {
        console.error(
          `Communication recovery failed for ${messageId}:`,
          recoveryError,
        );
      }

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
    if (!this.twilioClient) {
      throw new Error('Twilio client not initialized');
    }

    const metadata = message.metadata as any;
    const to = metadata?.phone || metadata?.to;
    
    if (!to) {
      throw new Error('No recipient phone number');
    }

    const result = await this.twilioClient.messages.create({
      body: message.content,
      to,
      from: process.env.TWILIO_PHONE_NUMBER || '',
    });

    // Store Twilio message SID
    await prisma.message.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          twilioMessageSid: result.sid,
        },
      },
    });
  }

  private async sendEmail(message: any) {
    if (!this.emailTransporter) {
      throw new Error('Email transporter not initialized');
    }

    const metadata = message.metadata as any;
    const to = metadata?.email || metadata?.to;
    const subject = metadata?.subject || 'Message from Hālo';

    const info = await this.emailTransporter.sendMail({
      from: process.env.SENDGRID_FROM_EMAIL || 'noreply@halo.com',
      to,
      subject,
      text: message.content,
      html: message.content.replace(/\n/g, '<br>'),
    });

    await prisma.message.update({
      where: { id: message.id },
      data: {
        metadata: {
          ...metadata,
          smtpMessageId: info.messageId,
        },
      },
    });
  }

  private async markMessageSent(message: any) {
    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: 'sent',
        sentAt: message.sentAt || new Date(),
      },
    });

    await prisma.timelineEvent.create({
      data: {
        tenantId: message.accountId,
        entityType: TimelineEntityType.MESSAGE,
        entityId: message.id,
        eventType: 'MESSAGE_SENT',
        payloadJson: { channel: message.channel },
        actorId: null,
        actorType: TimelineActorType.system,
      },
    });
  }

  private getDeliveryMarker(message: any): string | null {
    const metadata = (message.metadata as any) || {};

    if (message.channel === 'sms' && typeof metadata.twilioMessageSid === 'string') {
      return metadata.twilioMessageSid;
    }

    if (message.channel === 'email' && typeof metadata.smtpMessageId === 'string') {
      return metadata.smtpMessageId;
    }

    return null;
  }

  // If the provider receipt is already in the row, only finish local
  // bookkeeping; never call Twilio/SMTP a second time.
  private async recoverPersistedDelivery(message: any): Promise<boolean> {
    if (!this.getDeliveryMarker(message)) {
      return false;
    }

    await this.markMessageSent(message);
    return true;
  }

  private async recoverFromPersistedDelivery(messageId: string): Promise<boolean> {
    const latest = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!latest) {
      return false;
    }

    if (latest.status === 'sent' || latest.status === 'delivered') {
      return true;
    }

    return this.recoverPersistedDelivery(latest);
  }
}

