import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AutomationService } from '../../automation/automation.service';
import * as complianceUtils from '@halo/shared';

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(
    private prisma: PrismaService,
    private automationService: AutomationService,
  ) {}

  async handleInbound(body: any) {
    const from = body.From;
    const to = body.To;
    const messageBody = body.Body;

    const accountId = await this.resolveAccountId(to, from);

    if (complianceUtils.containsStopKeywords(messageBody)) {
      const normalizedPhone = complianceUtils.normalizePhoneNumber(from);

      const existing = await this.prisma.dNCList.findFirst({
        where: { accountId, phone: normalizedPhone },
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

      await this.prisma.message.create({
        data: {
          accountId,
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
      await this.prisma.message.create({
        data: {
          accountId,
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

    const inboundMsg = await this.prisma.message.create({
      data: {
        accountId,
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

    try {
      await this.automationService.attributeReply(
        inboundMsg.id,
        accountId,
      );
    } catch (err) {
      this.logger.warn(`Attribution failed for message ${inboundMsg.id}: ${err}`);
    }

    return { message: 'Received' };
  }

  async handleStatus(body: any) {
    const messageSid = body.MessageSid;
    const status = body.MessageStatus;

    const messages = await this.prisma.message.findMany({
      where: {
        metadata: {
          path: ['twilioMessageSid'],
          equals: messageSid,
        },
      },
    });

    if (messages.length > 0) {
      const current = messages[0];
      await this.prisma.message.update({
        where: { id: current.id },
        data: {
          status: this.resolveMessageStatus(current.status, status),
          metadata: {
            ...(current.metadata as any || {}),
            deliveryStatus: status,
            deliveryStatusUpdatedAt: new Date().toISOString(),
          },
        },
      });
    }

    return { message: 'Status updated' };
  }

  /**
   * Resolve accountId by looking up the 'To' number (our Twilio number) or
   * falling back to the most recent outbound message to the sender.
   */
  private async resolveAccountId(
    toPhone: string,
    fromPhone: string,
  ): Promise<string> {
    const normalized = complianceUtils.normalizePhoneNumber(fromPhone);

    const recentOutbound = await this.prisma.message.findFirst({
      where: {
        direction: 'outbound',
        metadata: {
          path: ['to'],
          string_contains: normalized,
        },
      },
      orderBy: { createdAt: 'desc' },
      select: { accountId: true },
    });

    if (recentOutbound?.accountId) {
      return recentOutbound.accountId;
    }

    const lead = await this.prisma.lead.findFirst({
      where: {
        OR: [
          { canonicalPhone: normalized },
          { canonicalPhone: fromPhone },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { accountId: true },
    });

    if (lead?.accountId) {
      return lead.accountId;
    }

    this.logger.warn(
      `Could not resolve accountId for from=${fromPhone} to=${toPhone}, defaulting to 'unknown'`,
    );
    return 'unknown';
  }

  private resolveMessageStatus(currentStatus: string, twilioStatus: string): string {
    const mapped = this.mapTwilioStatus(twilioStatus);

    if (mapped === 'delivered') {
      return 'delivered';
    }

    if (mapped === 'failed') {
      return currentStatus === 'delivered' ? currentStatus : 'failed';
    }

    // Twilio transport callbacks must never reopen the app-level approval flow.
    if (currentStatus === 'delivered' || currentStatus === 'failed') {
      return currentStatus;
    }

    return 'sent';
  }

  private mapTwilioStatus(status: string): string {
    const normalized = typeof status === 'string' ? status.toLowerCase() : '';
    if (['delivered', 'read', 'received'].includes(normalized)) {
      return 'delivered';
    }
    if (['failed', 'undelivered', 'canceled'].includes(normalized)) {
      return 'failed';
    }

    // Twilio only emits these callbacks after it has already accepted the send,
    // so they map to the transport lifecycle rather than app approval states.
    return 'sent';
  }
}
