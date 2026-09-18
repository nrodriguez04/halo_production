import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AutomationService } from '../../automation/automation.service';
import * as complianceUtils from '@halo/shared';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { protectPhone } from '../../pii/contact-crypto';
import { counterpartyColumns } from '../../communications/message-counterparty';

@Injectable()
export class TwilioService {
  private readonly logger = new Logger(TwilioService.name);

  constructor(
    private prisma: PrismaService,
    private automationService: AutomationService,
    private pii: LeadPiiService,
  ) {}

  async handleInbound(body: any) {
    const from = body.From;
    const to = body.To;
    const messageBody = body.Body;

    const accountId = await this.resolveAccountId(to, from);

    if (complianceUtils.containsStopKeywords(messageBody)) {
      const normalizedPhone = complianceUtils.normalizePhoneNumber(from);

      const protectedPhone = protectPhone(normalizedPhone);
      const existing = await this.prisma.dNCList.findFirst({
        where: {
          accountId,
          OR: [
            { phoneHash: protectedPhone.phoneHash },
            { phone: normalizedPhone },
          ],
        },
      });

      if (!existing) {
        await this.prisma.dNCList.create({
          data: {
            accountId,
            phone: normalizedPhone,
            ...protectedPhone,
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
          ...counterpartyColumns('sms', from),
          metadata: {
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
          ...counterpartyColumns('sms', from),
          metadata: {
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
        ...counterpartyColumns('sms', from),
        metadata: {
          to,
          twilioMessageSid: body.MessageSid,
        },
      },
    });

    try {
      await this.automationService.attributeReply(inboundMsg.id, accountId);
    } catch (err) {
      this.logger.warn(
        `Attribution failed for message ${inboundMsg.id}: ${err}`,
      );
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
      await this.prisma.message.update({
        where: { id: messages[0].id },
        data: {
          status: this.nextStatus(
            messages[0].status,
            this.mapTwilioStatus(status),
          ),
          metadata: {
            ...((messages[0].metadata as any) || {}),
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
    const accountIds = await this.findMatchingAccountIds(fromPhone);

    if (accountIds.length === 1) {
      return accountIds[0];
    }

    if (accountIds.length > 1) {
      // We currently use a shared Twilio sender number, so a sender phone that
      // matches multiple tenants must fail closed instead of leaking the reply
      // to whichever tenant happened to write most recently.
      this.logger.warn(
        `Ambiguous accountId for inbound Twilio message from=${fromPhone} to=${toPhone}; matched ${accountIds.length} tenants, defaulting to 'unknown'`,
      );
      return 'unknown';
    }

    this.logger.warn(
      `Could not resolve accountId for from=${fromPhone} to=${toPhone}, defaulting to 'unknown'`,
    );
    return 'unknown';
  }

  private async findMatchingAccountIds(fromPhone: string): Promise<string[]> {
    const phoneCandidates = this.buildPhoneCandidates(fromPhone);

    const [outboundMatches, leadMatches] = await Promise.all([
      this.prisma.message.findMany({
        where: {
          direction: 'outbound',
          OR: [
            // Indexed blind-index match on the recipient; the JSON arm covers
            // rows the backfill has not reached and goes once it has run.
            {
              counterpartyHash: {
                in: phoneCandidates.map((phone) => this.pii.phoneHash(phone)),
              },
            },
            ...phoneCandidates.map((phone) => ({
              metadata: {
                path: ['to'],
                string_contains: phone,
              },
            })),
          ],
        },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
      this.prisma.lead.findMany({
        where: {
          canonicalPhoneHash: {
            in: phoneCandidates.map((phone) => this.pii.phoneHash(phone)),
          },
        },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
    ]);

    return Array.from(
      new Set(
        [...outboundMatches, ...leadMatches]
          .map((match) => match.accountId)
          .filter((accountId): accountId is string => !!accountId),
      ),
    );
  }

  private buildPhoneCandidates(phone: string): string[] {
    const trimmed = phone.trim();
    const normalized = complianceUtils.normalizePhoneNumber(trimmed);
    return Array.from(new Set([trimmed, normalized].filter(Boolean)));
  }

  /**
   * Twilio transport states -> app workflow states. A callback only exists
   * for a message that was already approved and handed to Twilio, so no
   * transport state maps back to `pending_approval`; `queued` used to, which
   * let a retried or out-of-order callback reopen a delivered SMS in the
   * approval queue and invite a second send.
   */
  private mapTwilioStatus(status: string): string | null {
    const statusMap: Record<string, string> = {
      accepted: 'sent',
      queued: 'sent',
      sending: 'sent',
      sent: 'sent',
      delivered: 'delivered',
      read: 'delivered',
      failed: 'failed',
      undelivered: 'failed',
      canceled: 'failed',
    };

    return statusMap[status] ?? null;
  }

  /**
   * Workflow status is monotonic once dispatched: sent -> delivered, and
   * failed is terminal unless delivery was already confirmed. Callbacks can
   * arrive out of order, so a later `sent` must not undo `delivered`.
   */
  private nextStatus(current: string, incoming: string | null): string {
    if (!incoming) return current;
    const rank: Record<string, number> = {
      pending_approval: 0,
      approved: 1,
      blocked: 1,
      sent: 2,
      delivered: 3,
      failed: 3,
    };
    if (current === 'delivered') return current;
    if (incoming === 'failed') return 'failed';
    if (current === 'failed') return current;
    return (rank[incoming] ?? 0) > (rank[current] ?? 0) ? incoming : current;
  }
}
