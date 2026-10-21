import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineActorType } from '@prisma/client';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { DocumentsService } from '../documents/documents.service';
import { OptOutService } from '../compliance/opt-out.service';
import { BuyerIntelligenceService } from '../buyers/buyer-intelligence.service';
import { protectBuyerContact } from '../buyers/buyer-pii';
import { openValue, protectEmail } from '../pii/contact-crypto';
import { ShareLinksService } from './share-links.service';
import { OffersService } from './offers.service';
import type { PackageContent } from './deal-packages.service';
import { buyerEvent, dealEvent } from './timeline-events';

export interface PublicResponseInput {
  intent: 'interested' | 'offer' | 'not_interested' | 'unsubscribe';
  name?: string;
  email?: string;
  phone?: string;
  amount?: number;
  earnestMoney?: number;
  closeBy?: Date;
  financing?: string;
  conditions?: string;
  message?: string;
  consentToEmail?: boolean;
  acknowledgedDisclosures?: boolean;
}

export interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * The buyer's side of a deal link (docs/contract-flipping.md s5): the
 * approved package and a way to answer it. A response is the buyer's own
 * statement, recorded as such: interest, a written offer, a decline, or a
 * request to stop. Consent to be emailed is recorded only when the buyer
 * ticks it, with the page, time and address as evidence.
 */
@Injectable()
export class PublicDealPagesService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private documents: DocumentsService,
    private optOut: OptOutService,
    private buyers: BuyerIntelligenceService,
    private links: ShareLinksService,
    private offers: OffersService,
  ) {}

  async view(token: string) {
    const { link, pkg } = await this.links.resolve(token);
    await this.links.recordView(link.id);
    if (link.campaignId && link.buyerId) {
      await this.prisma.dispositionTarget.updateMany({
        where: {
          campaignId: link.campaignId,
          buyerId: link.buyerId,
          status: 'contacted',
        },
        data: { status: 'viewed', lastActivityAt: new Date() },
      });
    }
    const buyer = link.buyerId
      ? await this.prisma.buyer.findFirst({
          where: { id: link.buyerId, accountId: link.accountId },
          select: { name: true },
        })
      : null;
    const content = pkg.content as unknown as PackageContent;
    return {
      package: content,
      version: pkg.version,
      greeting: buyer?.name ?? null,
      identified: !!link.buyerId,
      expiresAt: link.expiresAt.toISOString(),
    };
  }

  /** A shared photo or document, only if it is on the approved package. */
  async file(
    token: string,
    documentId: string,
  ): Promise<{ body: Readable; contentType: string; fileName: string }> {
    const { link, pkg } = await this.links.resolve(token);
    const content = pkg.content as unknown as PackageContent;
    const allowed =
      content.documents.some((d) => d.id === documentId) ||
      content.photos.some((p) => p.id === documentId);
    if (!allowed) throw new NotFoundException('Not found');
    return this.documents.download(link.accountId, documentId);
  }

  async respond(token: string, input: PublicResponseInput, meta: RequestMeta) {
    const { link } = await this.links.resolve(token);
    const accountId = link.accountId;
    const buyerId =
      link.buyerId ?? (await this.buyerFromForm(accountId, input));
    const now = new Date();

    if (input.intent === 'unsubscribe') {
      const buyer = await this.prisma.buyer.findFirst({
        where: { id: buyerId, accountId },
        select: { emailEnc: true },
      });
      const email = buyer?.emailEnc ? openValue(buyer.emailEnc) : input.email;
      if (email) {
        await this.optOut.recordEmailOptOut({
          accountId,
          email,
          source: `deal_page:${link.id}`,
          reason: 'Buyer asked to stop receiving deals from the deal page',
        });
      }
      await this.prisma.buyer.updateMany({
        where: { id: buyerId, accountId },
        data: { status: 'do_not_market' },
      });
      await this.setTarget(link, buyerId, 'opted_out');
      await buyerEvent(
        this.timeline,
        accountId,
        buyerId,
        'BUYER_UNSUBSCRIBED',
        { linkId: link.id },
        null,
        TimelineActorType.webhook,
      );
      return { recorded: 'unsubscribed' };
    }

    if (input.consentToEmail) {
      await this.buyers
        .recordConsent(accountId, buyerId, null, {
          channel: 'email',
          source: 'deal_page',
          evidence: {
            statement: 'Ticked "Email me deals like this" on a deal page',
            linkId: link.id,
            at: now.toISOString(),
            ip: meta.ip ?? null,
            userAgent: meta.userAgent?.slice(0, 200) ?? null,
          },
        })
        .catch(() => undefined);
    }

    if (input.intent === 'not_interested') {
      await this.setTarget(link, buyerId, 'declined');
      await dealEvent(
        this.timeline,
        accountId,
        link.dealId,
        'BUYER_DECLINED_DEAL',
        {
          buyerId,
          linkId: link.id,
          message: input.message ?? null,
        },
        null,
        TimelineActorType.webhook,
      );
      return { recorded: 'declined' };
    }

    if (input.intent === 'interested') {
      await this.setTarget(link, buyerId, 'interested');
      await dealEvent(
        this.timeline,
        accountId,
        link.dealId,
        'BUYER_INTERESTED',
        {
          buyerId,
          linkId: link.id,
          message: input.message ?? null,
        },
        null,
        TimelineActorType.webhook,
      );
      return { recorded: 'interest' };
    }

    if (!input.acknowledgedDisclosures) {
      throw new BadRequestException(
        'Acknowledge the disclosures before making an offer.',
      );
    }
    const offer = await this.offers.recordFromBuyer(accountId, link.dealId, {
      buyerId,
      amount: input.amount as number,
      kind: 'written_offer',
      source: 'deal_page',
      campaignId: link.campaignId ?? undefined,
      earnestMoney: input.earnestMoney,
      closeBy: input.closeBy,
      financing: input.financing,
      conditions:
        [input.conditions, input.message].filter(Boolean).join('\n') ||
        undefined,
    });
    await this.prisma.buyerOffer.update({
      where: { id: offer.id },
      data: {
        // When the buyer acknowledged the disclosures, and through which link.
        evaluation: {
          ...((offer.evaluation as Record<string, unknown>) ?? {}),
          acknowledgedDisclosuresAt: now.toISOString(),
          linkId: link.id,
        } as Prisma.InputJsonObject,
      },
    });
    return { recorded: 'offer', offerId: offer.id };
  }

  /**
   * A response through a link not tied to one buyer: the buyer is matched by
   * email, or created with the deal page as the source.
   */
  private async buyerFromForm(
    accountId: string,
    input: PublicResponseInput,
  ): Promise<string> {
    if (!input.email || !input.name) {
      throw new BadRequestException(
        'Give your name and email so we can reply.',
      );
    }
    const { emailHash } = protectEmail(input.email);
    const existing = emailHash
      ? await this.prisma.buyer.findFirst({
          where: { accountId, emailHash },
          select: { id: true },
        })
      : null;
    if (existing) return existing.id;
    const created = await this.prisma.buyer.create({
      data: {
        accountId,
        name: input.name,
        source: 'deal_page',
        sourceDetail: 'Responded through a shared deal page',
        ...protectBuyerContact({ email: input.email, phone: input.phone }),
      },
    });
    return created.id;
  }

  private async setTarget(
    link: { campaignId: string | null },
    buyerId: string,
    status: 'interested' | 'declined' | 'opted_out',
  ) {
    if (!link.campaignId) return;
    await this.prisma.dispositionTarget.updateMany({
      where: { campaignId: link.campaignId, buyerId },
      data: { status, lastActivityAt: new Date() },
    });
  }
}
