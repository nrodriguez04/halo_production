import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as complianceUtils from '@halo/shared';

@Injectable()
export class TwilioService {
  constructor(private prisma: PrismaService) {}

  async handleInbound(body: any) {
    const from = body.From;
    const to = body.To;
    const messageBody = body.Body;

    // Check for STOP/HELP keywords
    if (complianceUtils.containsStopKeywords(messageBody)) {
      // Add to DNC list
      const normalizedPhone = complianceUtils.normalizePhoneNumber(from);
      const accountId = 'halo-hq'; // Get from phone mapping in production
      
      // Check if already exists
      const existing = await this.prisma.dNCList.findFirst({
        where: {
          accountId,
          phone: normalizedPhone,
        },
      });

      if (!existing) {
        await this.prisma.dNCList.create({
          data: {
            accountId,
            phone: normalizedPhone,
            source: 'stop_keyword',
            reason: 'User sent STOP keyword',
          },
        });
      }

      // Store inbound message
      await this.prisma.message.create({
        data: {
          accountId: 'halo-hq',
          channel: 'sms',
          direction: 'inbound',
          status: 'delivered',
          content: messageBody,
          metadata: {
            from,
            to,
            twilioMessageSid: body.MessageSid,
            handledStop: true,
          },
        },
      });

      return { message: 'STOP processed' };
    }

    if (complianceUtils.containsHelpKeywords(messageBody)) {
      // Store help request
      await this.prisma.message.create({
        data: {
          accountId: 'halo-hq',
          channel: 'sms',
          direction: 'inbound',
          status: 'delivered',
          content: messageBody,
          metadata: {
            from,
            to,
            twilioMessageSid: body.MessageSid,
            handledHelp: true,
          },
        },
      });

      return { message: 'HELP processed' };
    }

    // Store regular inbound message
    await this.prisma.message.create({
      data: {
        accountId: 'halo-hq',
        channel: 'sms',
        direction: 'inbound',
        status: 'delivered',
        content: messageBody,
        metadata: {
          from,
          to,
          twilioMessageSid: body.MessageSid,
        },
      },
    });

    return { message: 'Received' };
  }

  async handleStatus(body: any) {
    const messageSid = body.MessageSid;
    const status = body.MessageStatus;

    // Find message by SID
    const messages = await this.prisma.message.findMany({
      where: {
        metadata: {
          path: ['twilioMessageSid'],
          equals: messageSid,
        },
      },
    });

    if (messages.length > 0) {
      await this.prisma.message.update({
        where: { id: messages[0].id },
        data: {
          status: this.mapTwilioStatus(status),
          metadata: {
            ...(messages[0].metadata as any || {}),
            deliveryStatus: status,
            deliveryStatusUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }

    return { message: 'Status updated' };
  }

  private mapTwilioStatus(status: string): string {
    const statusMap: Record<string, string> = {
      queued: 'pending_approval',
      sent: 'sent',
      delivered: 'delivered',
      failed: 'failed',
      undelivered: 'failed',
    };

    return statusMap[status] || 'sent';
  }
}

