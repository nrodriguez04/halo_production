import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AutomationService } from '../../automation/automation.service';
import { AgentOrchestrationService } from '../../agent/agent-orchestration.service';
import { DocumentsService } from '../../documents/documents.service';
import { TimelineService } from '../../timeline/timeline.service';
import { LeadPiiService } from '../../leads/lead-pii.service';
import { GLOBAL_ACCOUNT_ID } from '../../control-plane/control-plane.service';
import { counterpartyColumns } from '../../communications/message-counterparty';

/** Replies that match no tenant are stored where no tenant sees them. */
export const UNATTRIBUTED_ACCOUNT_ID = 'unknown';

const MAX_TEXT_CHARS = 20_000;
const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ATTACHMENT_NAME = /\.(pdf|docx?|xlsx?|csv|txt|png|jpe?g|gif|webp)$/i;

export interface InboundAttachment {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** One inbound email, whichever provider delivered it. */
export interface ParsedInboundEmail {
  /** The From header as received, e.g. `Pat Owner <pat@example.com>`. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  /** The raw header block, one header per line. */
  headers: string;
  /** SMTP envelope when the provider supplies it (SendGrid does). */
  envelope?: { from?: string; to?: string[] } | null;
  attachments: InboundAttachment[];
}

export interface InboundEmailResult {
  handled:
    | 'message'
    | 'auto_reply'
    | 'buyer_reply'
    | 'unmatched'
    | 'unattributed'
    | 'ignored';
  messageId?: string;
  accountId?: string;
  queued?: boolean;
  reason?: string;
}

interface LeadLink {
  leadId: string;
  dealId: string | null;
}

// ------------------------------------------------------------ pure helpers

/** `Pat Owner <pat@example.com>` -> `pat@example.com`; a bare address passes through. */
export function extractAddress(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  const angled = value.match(/<([^<>\s]+@[^<>\s]+)>/);
  const raw = (angled ? angled[1] : value).trim().replace(/^mailto:/i, '');
  const m = raw.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

/** The display name in front of an address, if any. */
export function extractName(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>/);
  const name = m?.[1]?.trim();
  return name && !name.includes('@') ? name : null;
}

/** One header's value from a raw header block (case-insensitive, first match). */
export function headerValue(
  headers: string | null | undefined,
  name: string,
): string | null {
  if (!headers) return null;
  const re = new RegExp(
    `^${name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}:\\s*(.+)$`,
    'im',
  );
  const m = headers.match(re);
  return m ? m[1].trim() : null;
}

/**
 * Bounces, vacation responders and list traffic are not a seller talking
 * to us; they are recorded but never answered.
 */
export function isAutoReply(
  headers: string | null | undefined,
  subject: string | null | undefined,
): boolean {
  const auto = headerValue(headers, 'Auto-Submitted');
  if (auto && !/^no\b/i.test(auto)) return true;
  if (
    headerValue(headers, 'X-Autoreply') ||
    headerValue(headers, 'X-Autorespond')
  )
    return true;
  const precedence = headerValue(headers, 'Precedence');
  if (precedence && /^(bulk|auto_reply|junk|list)$/i.test(precedence))
    return true;
  if (headerValue(headers, 'X-Failed-Recipients')) return true;
  const s = (subject ?? '').trim();
  return /^(auto(matic)?[\s-]*reply|automatic response|out of (the )?office|delivery status notification|undeliver(able|ed)|mail delivery (failed|subsystem)|returned mail)/i.test(
    s,
  );
}

const QUOTE_CUT = [
  /^On .{0,200}?wrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^_{5,}\s*$/m,
  /^Sent from my (iPhone|iPad|Galaxy|Android|Samsung).*$/im,
];

/**
 * The part the person typed: everything above the first quoted block or
 * "On ... wrote:" line, minus `>` lines. Falls back to the whole text when
 * the cut would leave nothing.
 */
export function stripQuotedReply(text: string | null | undefined): string {
  const original = (text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!original) return '';
  let cut = original.length;
  for (const re of QUOTE_CUT) {
    const m = original.match(re);
    if (m && m.index !== undefined && m.index < cut) cut = m.index;
  }
  // Outlook-style header block: "From: ..." followed by Sent/To/Subject.
  const outlook = original.match(/^From:\s.+\n(?:Sent|Date):\s.+\n/im);
  if (outlook && outlook.index !== undefined && outlook.index < cut)
    cut = outlook.index;
  const top = original
    .slice(0, cut)
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return top || original;
}

/** A readable fallback when a client sends HTML only. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return '';
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ------------------------------------------------------------ service

/**
 * Inbound email from the provider's parse webhook: linked to the lead that
 * carries the sender's address (blind index), recorded like an inbound SMS,
 * attachments filed in the documents library, and the Outreach Drafter
 * queued with the message. Auto-replies and bounces are recorded only.
 * Addresses are sealed on the row; metadata never carries one.
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    private prisma: PrismaService,
    private automation: AutomationService,
    private agents: AgentOrchestrationService,
    private documents: DocumentsService,
    private timeline: TimelineService,
    private pii: LeadPiiService,
  ) {}

  async handle(parsed: ParsedInboundEmail): Promise<InboundEmailResult> {
    const sender =
      extractAddress(parsed.envelope?.from) ?? extractAddress(parsed.from);
    if (!sender) return { handled: 'ignored', reason: 'no sender address' };

    const hash = this.pii.emailHash(sender);
    const accountIds = await this.matchingAccounts(hash);
    const accountId =
      accountIds.length === 1 ? accountIds[0] : UNATTRIBUTED_ACCOUNT_ID;
    if (accountIds.length > 1) {
      this.logger.warn(
        `Inbound email matched ${accountIds.length} tenants; stored unattributed`,
      );
    }

    const autoReply = isAutoReply(parsed.headers, parsed.subject);
    const link =
      accountId === UNATTRIBUTED_ACCOUNT_ID
        ? null
        : await this.linkToLead(accountId, hash);
    const buyer =
      accountId === UNATTRIBUTED_ACCOUNT_ID || link
        ? null
        : await this.linkToBuyer(accountId, hash);

    const fullText = (
      parsed.text?.trim() ? parsed.text : htmlToText(parsed.html)
    ).slice(0, MAX_TEXT_CHARS);
    const content = stripQuotedReply(fullText) || '(no text in this email)';
    const subject = (parsed.subject ?? '').trim().slice(0, 300);

    const message = await this.prisma.message.create({
      data: {
        accountId,
        channel: 'email',
        direction: 'inbound',
        status: 'delivered',
        content,
        leadId: link?.leadId ?? null,
        dealId: link?.dealId ?? buyer?.dealId ?? null,
        ...counterpartyColumns('email', sender),
        metadata: {
          subject,
          to:
            extractAddress(parsed.envelope?.to?.[0]) ??
            extractAddress(parsed.to),
          senderName: extractName(parsed.from),
          messageIdHeader: headerValue(parsed.headers, 'Message-ID'),
          inReplyTo: headerValue(parsed.headers, 'In-Reply-To'),
          autoReply,
          hasHtml: !!parsed.html?.trim(),
          counterpartyType: link ? 'lead' : buyer ? 'buyer' : 'unknown',
          ...(buyer ? { buyerId: buyer.buyerId } : {}),
          attachments: parsed.attachments.map((a) => ({
            name: a.originalname,
            contentType: a.mimetype,
            size: a.size,
          })),
          fullText: fullText !== content ? fullText : undefined,
        } as Prisma.InputJsonObject,
      },
    });

    if (accountId === UNATTRIBUTED_ACCOUNT_ID) {
      return { handled: 'unattributed', messageId: message.id };
    }

    const documentIds = await this.fileAttachments(
      accountId,
      message.id,
      parsed.attachments,
      link,
      buyer,
    );

    if (link) {
      try {
        await this.automation.attributeReply(message.id, accountId);
      } catch (err) {
        this.logger.warn(`Attribution failed for email ${message.id}: ${err}`);
      }
      await this.timeline.appendEvent({
        tenantId: accountId,
        entityType: link.dealId
          ? TimelineEntityType.DEAL
          : TimelineEntityType.LEAD,
        entityId: link.dealId ?? link.leadId,
        eventType: autoReply ? 'INBOUND_EMAIL_AUTO_REPLY' : 'INBOUND_EMAIL',
        payload: { messageId: message.id, subject, documentIds },
        actorId: null,
        actorType: TimelineActorType.webhook,
      });
      if (autoReply) {
        return {
          handled: 'auto_reply',
          messageId: message.id,
          accountId,
          queued: false,
        };
      }
      const queued = await this.queueDrafter(accountId, message.id, link);
      return { handled: 'message', messageId: message.id, accountId, queued };
    }

    if (buyer) {
      if (buyer.dealId) {
        await this.timeline.appendEvent({
          tenantId: accountId,
          entityType: TimelineEntityType.DEAL,
          entityId: buyer.dealId,
          eventType: 'BUYER_REPLIED',
          payload: {
            messageId: message.id,
            buyerId: buyer.buyerId,
            subject,
            documentIds,
          },
          actorId: null,
          actorType: TimelineActorType.webhook,
        });
      }
      return {
        handled: 'buyer_reply',
        messageId: message.id,
        accountId,
        queued: false,
      };
    }

    return {
      handled: 'unmatched',
      messageId: message.id,
      accountId,
      queued: false,
    };
  }

  /** Tenants with a relationship to the sender: leads, outbound email, buyers, consents. */
  private async matchingAccounts(emailHash: string): Promise<string[]> {
    const [leads, messages, buyers, consents] = await Promise.all([
      this.prisma.lead.findMany({
        where: { canonicalEmailHash: emailHash },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
      this.prisma.message.findMany({
        where: {
          direction: 'outbound',
          channel: 'email',
          counterpartyHash: emailHash,
        },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
      this.prisma.buyer.findMany({
        where: { emailHash },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
      this.prisma.consent.findMany({
        where: { emailHash },
        select: { accountId: true },
        distinct: ['accountId'],
        take: 2,
      }),
    ]);
    return Array.from(
      new Set(
        [...leads, ...messages, ...buyers, ...consents]
          .map((r) => r.accountId)
          .filter(
            (id): id is string =>
              !!id &&
              id !== UNATTRIBUTED_ACCOUNT_ID &&
              id !== GLOBAL_ACCOUNT_ID,
          ),
      ),
    );
  }

  private async linkToLead(
    accountId: string,
    emailHash: string,
  ): Promise<LeadLink | null> {
    const lead = await this.prisma.lead.findFirst({
      where: { accountId, canonicalEmailHash: emailHash },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        deals: {
          where: { stage: { not: 'lost' } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!lead) return null;
    return { leadId: lead.id, dealId: lead.deals[0]?.id ?? null };
  }

  /** A buyer writing back, tied to the deal we last emailed them about. */
  private async linkToBuyer(
    accountId: string,
    emailHash: string,
  ): Promise<{ buyerId: string; dealId: string | null } | null> {
    const buyer = await this.prisma.buyer.findFirst({
      where: { accountId, emailHash },
      select: { id: true },
    });
    if (!buyer) return null;
    const last = await this.prisma.message.findFirst({
      where: {
        accountId,
        direction: 'outbound',
        counterpartyHash: emailHash,
        dealId: { not: null },
      },
      orderBy: { createdAt: 'desc' },
      select: { dealId: true },
    });
    return { buyerId: buyer.id, dealId: last?.dealId ?? null };
  }

  /** Attachments into the documents library, on the lead and deal when known. */
  private async fileAttachments(
    accountId: string,
    messageId: string,
    attachments: InboundAttachment[],
    link: LeadLink | null,
    buyer: { buyerId: string; dealId: string | null } | null,
  ): Promise<string[]> {
    const ids: string[] = [];
    for (const file of attachments.slice(0, MAX_ATTACHMENTS)) {
      if (
        !ATTACHMENT_NAME.test(file.originalname) ||
        file.size > MAX_ATTACHMENT_BYTES
      ) {
        continue;
      }
      try {
        const doc = await this.documents.create(
          accountId,
          'system:inbound-email',
          {
            category: 'other',
            title: file.originalname,
            description: `Attached to an inbound email (message ${messageId})`,
            dealId: link?.dealId ?? buyer?.dealId ?? undefined,
            leadId: link?.leadId ?? undefined,
            buyerId: buyer?.buyerId ?? undefined,
            tags: ['inbound-email'],
          },
          file,
        );
        ids.push(doc.id);
      } catch (err) {
        this.logger.warn(
          `Attachment ${file.originalname} not filed: ${(err as Error).message}`,
        );
      }
    }
    if (ids.length) {
      const row = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { metadata: true },
      });
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          metadata: {
            ...((row?.metadata as Record<string, unknown>) ?? {}),
            documentIds: ids,
          } as Prisma.InputJsonObject,
        },
      });
    }
    return ids;
  }

  /** Design doc s3.3: every linked reply gets the Outreach Drafter's read. */
  private async queueDrafter(
    accountId: string,
    messageId: string,
    link: LeadLink,
  ) {
    try {
      return await this.agents.enqueue({
        agent: 'outreach_drafter',
        accountId,
        entityType: link.dealId ? 'deal' : 'lead',
        entityId: link.dealId ?? link.leadId,
        trigger: 'inbound',
        triggerEventId: `inbound:${messageId}`,
        messageId,
      });
    } catch (err) {
      this.logger.warn(
        `Could not queue the Outreach Drafter for email ${messageId}: ${err}`,
      );
      return false;
    }
  }
}
