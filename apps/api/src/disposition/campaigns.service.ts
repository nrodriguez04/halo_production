import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { BuyerMatch } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { brandName } from '../communications/outbound-content';
import { BuyerIntelligenceService } from '../buyers/buyer-intelligence.service';
import { DispositionEligibilityService } from './eligibility.service';
import {
  DealPackagesService,
  type PackageContent,
} from './deal-packages.service';
import { ShareLinksService, publicAppUrl } from './share-links.service';
import { OffersService } from './offers.service';
import { BuyerMessagingService, greetingName } from './buyer-messaging.service';
import { dealEvent } from './timeline-events';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Buyer links outlive the campaign by nothing: they stop with it. */
const MAX_CAMPAIGN_DAYS = 21;
/** Marketing stops this many days before the seller contract's deadline. */
const DEADLINE_BUFFER_DAYS = 2;

function money(n: number) {
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/**
 * Disposition campaigns (docs/contract-flipping.md s5). Preparing one is
 * free and internal: price, package, the ranked buyers and the outreach
 * text, all for a person to review. Launching is the one approval: the gate
 * is checked, the package approved, one link per buyer created and the
 * approved outreach sent through the normal pipeline. Follow-ups are drafts
 * for approval.
 */
@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);

  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private controlPlane: ControlPlaneService,
    private buyers: BuyerIntelligenceService,
    private eligibility: DispositionEligibilityService,
    private packages: DealPackagesService,
    private links: ShareLinksService,
    private offers: OffersService,
    private messaging: BuyerMessagingService,
  ) {}

  async listForDeal(accountId: string, dealId: string) {
    return this.prisma.dispositionCampaign.findMany({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
      include: {
        targets: {
          orderBy: { rank: 'asc' },
          include: {
            buyer: {
              select: { id: true, name: true, company: true, pofStatus: true },
            },
          },
        },
        package: { select: { id: true, version: true, status: true } },
      },
    });
  }

  async get(accountId: string, campaignId: string) {
    const c = await this.prisma.dispositionCampaign.findFirst({
      where: { id: campaignId, accountId },
      include: {
        targets: {
          orderBy: { rank: 'asc' },
          include: {
            buyer: {
              select: { id: true, name: true, company: true, pofStatus: true },
            },
          },
        },
        package: true,
      },
    });
    if (!c) throw new NotFoundException(`Campaign ${campaignId} not found`);
    return c;
  }

  /** Build a draft: pricing, package, ranked buyers and outreach for review. */
  async prepare(
    accountId: string,
    dealId: string,
    userId: string | null,
    input: { askingPrice?: number; maxBuyers: number },
  ) {
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      dealId,
    );
    if (!agreement || agreement.status !== 'executed') {
      throw new BadRequestException(
        'A campaign is prepared from an executed seller contract. Record it on the Contract tab first.',
      );
    }
    const live = await this.prisma.dispositionCampaign.findFirst({
      where: { accountId, dealId, status: { in: ['active', 'paused'] } },
      select: { id: true, status: true },
    });
    if (live) {
      throw new ConflictException(
        `This deal already has a ${live.status} campaign (${live.id}).`,
      );
    }
    // A fresh preparation replaces an earlier draft (never one being launched).
    await this.prisma.dispositionCampaign.deleteMany({
      where: { accountId, dealId, status: 'draft', approvedAt: null },
    });

    const { recommendation } = await this.offers.pricing(accountId, dealId);
    const askingPrice = input.askingPrice ?? recommendation.recommendedPrice;
    if (askingPrice < recommendation.floorPrice) {
      throw new BadRequestException(
        `${money(askingPrice)} is below the floor of ${money(recommendation.floorPrice)}.`,
      );
    }
    const pkg = await this.packages.createDraft(
      accountId,
      dealId,
      userId,
      askingPrice,
    );
    const content = pkg.content as unknown as PackageContent;
    const { matches, considered } = await this.buyers.rankForDeal(
      accountId,
      dealId,
      {
        buyerPriceOverride: askingPrice,
      },
    );
    const chosen = selectTargets(matches, input.maxBuyers);
    const cp = await this.controlPlane.getStatus(accountId);
    const { subject, body } = outreachTemplate(content);
    const expiresAt = campaignExpiry(agreement.closingDeadline);

    const campaign = await this.prisma.dispositionCampaign.create({
      data: {
        accountId,
        dealId,
        packageId: pkg.id,
        askingPrice,
        floorPrice: recommendation.floorPrice,
        pricing: recommendation as unknown as Prisma.InputJsonObject,
        outreachSubject: subject,
        outreachBody: body,
        followUpDays: cp.campaignFollowUpDays,
        maxFollowUps: cp.campaignMaxFollowUps,
        expiresAt,
        createdBy: userId,
        targets: {
          create: chosen.map((m, i) => ({
            accountId,
            buyerId: m.buyerId,
            rank: i + 1,
            score: m.score,
            match: m as unknown as Prisma.InputJsonObject,
          })),
        },
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CAMPAIGN_PREPARED',
      {
        campaignId: campaign.id,
        askingPrice,
        floorPrice: recommendation.floorPrice,
        buyersSelected: chosen.length,
        buyersConsidered: considered,
        packageId: pkg.id,
      },
      userId,
    );
    return {
      campaign: await this.get(accountId, campaign.id),
      pricing: recommendation,
      notSelected: matches
        .filter((m) => !chosen.some((c) => c.buyerId === m.buyerId))
        .slice(0, 25)
        .map((m) => ({
          buyerId: m.buyerId,
          name: m.name,
          score: m.score,
          why: m.contactable
            ? m.mismatches.join('; ') || 'ranked below the cut'
            : m.excludedReasons.join('; '),
        })),
    };
  }

  async update(
    accountId: string,
    campaignId: string,
    userId: string,
    input: {
      askingPrice?: number;
      outreachSubject?: string;
      outreachBody?: string;
      removeBuyerIds?: string[];
      addBuyerIds?: string[];
      followUpDays?: number;
      maxFollowUps?: number;
    },
  ) {
    const c = await this.get(accountId, campaignId);
    if (c.status !== 'draft')
      throw new ConflictException('Only a draft campaign can be edited.');
    if (input.outreachBody && !input.outreachBody.includes('{{link}}')) {
      throw new BadRequestException(
        'The outreach must keep {{link}}: each buyer gets their own link.',
      );
    }
    if (input.askingPrice != null) {
      if (input.askingPrice < c.floorPrice) {
        throw new BadRequestException(
          `${money(input.askingPrice)} is below the floor of ${money(c.floorPrice)}.`,
        );
      }
      if (c.packageId) {
        await this.packages.updateDraft(accountId, c.packageId, userId, {
          askingPrice: input.askingPrice,
        });
      }
    }
    if (input.removeBuyerIds?.length) {
      await this.prisma.dispositionTarget.deleteMany({
        where: { campaignId, buyerId: { in: input.removeBuyerIds } },
      });
    }
    if (input.addBuyerIds?.length) {
      const { matches } = await this.buyers.rankForDeal(accountId, c.dealId, {
        buyerPriceOverride: input.askingPrice ?? c.askingPrice,
      });
      const have = new Set(c.targets.map((t) => t.buyerId));
      let rank = c.targets.length;
      for (const id of input.addBuyerIds) {
        if (have.has(id)) continue;
        const m = matches.find((x) => x.buyerId === id);
        if (!m) throw new NotFoundException(`Buyer ${id} not found`);
        if (!m.contactable || !m.channels.includes('email')) {
          throw new BadRequestException(
            `${m.name} cannot be added: ${m.excludedReasons.join('; ') || 'no email consent on file'}.`,
          );
        }
        rank += 1;
        await this.prisma.dispositionTarget.create({
          data: {
            accountId,
            campaignId,
            buyerId: id,
            rank,
            score: m.score,
            match: m as unknown as Prisma.InputJsonObject,
          },
        });
      }
    }
    await this.prisma.dispositionCampaign.update({
      where: { id: campaignId },
      data: {
        ...(input.askingPrice != null
          ? { askingPrice: input.askingPrice }
          : {}),
        ...(input.outreachSubject
          ? { outreachSubject: input.outreachSubject }
          : {}),
        ...(input.outreachBody ? { outreachBody: input.outreachBody } : {}),
        ...(input.followUpDays != null
          ? { followUpDays: input.followUpDays }
          : {}),
        ...(input.maxFollowUps != null
          ? { maxFollowUps: input.maxFollowUps }
          : {}),
      },
    });
    return this.get(accountId, campaignId);
  }

  /**
   * The one approval for buyer outreach. The person approving sees the
   * price, the package, the buyers and the message; approving it approves
   * those messages, each still checked for consent, DNC and quiet hours on
   * the way out. If nothing can be sent, the campaign stays a draft.
   */
  async approveAndLaunch(
    accountId: string,
    campaignId: string,
    userId: string,
  ) {
    const c = await this.get(accountId, campaignId);
    if (c.status !== 'draft')
      throw new ConflictException(`Campaign is ${c.status}.`);
    // The gate first: a deal that may not be marketed is refused for that
    // reason, whatever else is missing.
    await this.eligibility.assertEligible(
      accountId,
      c.dealId,
      'launching a buyer campaign',
    );
    if (!c.packageId)
      throw new BadRequestException('The campaign has no package.');
    if (c.targets.length === 0)
      throw new BadRequestException('Select at least one buyer.');
    const { recommendation } = await this.offers.pricing(accountId, c.dealId);
    if (c.askingPrice < recommendation.floorPrice) {
      throw new BadRequestException(
        `The asking price ${money(c.askingPrice)} is now below the floor of ${money(recommendation.floorPrice)}.`,
      );
    }
    if (!publicAppUrl()) {
      throw new BadRequestException(
        'Set PUBLIC_APP_URL to the web app origin: each buyer gets a link to their deal page.',
      );
    }
    // One launch per campaign, even on a double click or two people at
    // once: the first claim wins, the second is told it is under way.
    const claim = await this.prisma.dispositionCampaign.updateMany({
      where: { id: c.id, status: 'draft', approvedAt: null },
      data: { approvedAt: new Date(), approvedBy: userId },
    });
    if (claim.count === 0) {
      throw new ConflictException('This campaign is already being launched.');
    }
    const release = () =>
      this.prisma.dispositionCampaign.updateMany({
        where: { id: c.id, status: 'draft' },
        data: { approvedAt: null, approvedBy: null },
      });
    try {
      return await this.launchClaimed(accountId, c, userId, release);
    } catch (err) {
      await release();
      throw err;
    }
  }

  private async launchClaimed(
    accountId: string,
    c: Awaited<ReturnType<CampaignsService['get']>>,
    userId: string,
    release: () => Promise<unknown>,
  ) {
    const agreement = await this.eligibility.currentAgreement(
      accountId,
      c.dealId,
    );
    const pkg = await this.packages.approve(accountId, c.packageId!, userId);
    const expiresAt = campaignExpiry(agreement?.closingDeadline ?? null);

    const results: Array<{
      buyerId: string;
      name: string;
      status: string;
      reason?: string;
    }> = [];
    for (const t of c.targets) {
      const match = t.match as unknown as BuyerMatch;
      const link = await this.links.create(
        accountId,
        {
          dealId: c.dealId,
          packageId: pkg.id,
          campaignId: c.id,
          buyerId: t.buyerId,
          expiresAt,
        },
        userId,
      );
      const body = personalize(c.outreachBody, {
        name: t.buyer.name,
        link: link.url,
        match,
      });
      const sent = await this.messaging.email(accountId, {
        dealId: c.dealId,
        buyerId: t.buyerId,
        campaignId: c.id,
        type: 'disposition_outreach',
        subject: c.outreachSubject,
        body,
        approveAs: userId,
      });
      const ok = sent.status !== 'skipped';
      await this.prisma.dispositionTarget.update({
        where: { id: t.id },
        data: {
          shareLinkId: link.id,
          status: ok ? 'contacted' : 'skipped',
          skipReason: ok ? null : (sent.reason ?? null),
          lastMessageId: sent.messageId ?? null,
          contactedAt: ok ? new Date() : null,
          lastActivityAt: new Date(),
        },
      });
      if (!ok) {
        await this.links.revoke(accountId, link.id, userId);
      }
      results.push({
        buyerId: t.buyerId,
        name: t.buyer.name,
        status: sent.status,
        reason: sent.reason,
      });
    }
    const reached = results.filter((r) => r.status !== 'skipped');
    if (reached.length === 0) {
      await release();
      await dealEvent(
        this.timeline,
        accountId,
        c.dealId,
        'CAMPAIGN_LAUNCH_FAILED',
        {
          campaignId: c.id,
          reasons: results.map((r) => `${r.name}: ${r.reason}`),
        },
        userId,
      );
      return {
        campaign: await this.get(accountId, c.id),
        launched: false,
        results,
      };
    }
    await this.prisma.dispositionCampaign.update({
      where: { id: c.id },
      data: {
        status: 'active',
        approvedBy: userId,
        approvedAt: new Date(),
        launchedAt: new Date(),
        expiresAt,
      },
    });
    await this.prisma.dealEconomics.upsert({
      where: { dealId: c.dealId },
      create: {
        dealId: c.dealId,
        tenantId: accountId,
        assignmentPrice: c.askingPrice,
      },
      update: { assignmentPrice: c.askingPrice },
    });
    await dealEvent(
      this.timeline,
      accountId,
      c.dealId,
      'CAMPAIGN_LAUNCHED',
      {
        campaignId: c.id,
        askingPrice: c.askingPrice,
        packageVersion: pkg.version,
        sent: results.filter((r) => r.status === 'approved').length,
        awaitingApproval: results.filter((r) => r.status === 'pending_approval')
          .length,
        skipped: results
          .filter((r) => r.status === 'skipped')
          .map((r) => `${r.name}: ${r.reason}`),
        expiresAt: expiresAt.toISOString(),
      },
      userId,
    );
    return {
      campaign: await this.get(accountId, c.id),
      launched: true,
      results,
    };
  }

  async setStatus(
    accountId: string,
    campaignId: string,
    userId: string,
    to: 'paused' | 'active' | 'cancelled',
    reason?: string,
  ) {
    const c = await this.get(accountId, campaignId);
    const allowed: Record<string, string[]> = {
      active: ['paused', 'cancelled'],
      paused: ['active', 'cancelled'],
      draft: ['cancelled'],
    };
    if (!(allowed[c.status] ?? []).includes(to)) {
      throw new ConflictException(`A ${c.status} campaign cannot be ${to}.`);
    }
    if (to === 'active') {
      await this.eligibility.assertEligible(
        accountId,
        c.dealId,
        'resuming buyer marketing',
      );
    }
    const ended = to === 'cancelled';
    await this.prisma.dispositionCampaign.update({
      where: { id: c.id },
      data: {
        status: to,
        ...(ended
          ? { endedAt: new Date(), endedReason: reason ?? 'cancelled' }
          : {}),
        ...(to === 'paused'
          ? { endedReason: reason ?? 'paused by a person' }
          : {}),
        ...(to === 'active' ? { endedReason: null } : {}),
      },
    });
    if (ended) {
      await this.prisma.dealShareLink.updateMany({
        where: { accountId, campaignId: c.id, revokedAt: null },
        data: { revokedAt: new Date(), revokedBy: userId },
      });
    }
    await dealEvent(
      this.timeline,
      accountId,
      c.dealId,
      `CAMPAIGN_${to.toUpperCase()}`,
      {
        campaignId: c.id,
        reason: reason ?? null,
      },
      userId,
    );
    return this.get(accountId, c.id);
  }

  /**
   * Nightly: follow-up drafts for buyers who were contacted and have not
   * answered, up to the campaign's limit. Drafts wait for approval; Halo
   * does not chase buyers on its own authority.
   */
  async queueFollowUps(now = new Date()) {
    const campaigns = await this.prisma.dispositionCampaign.findMany({
      where: { status: 'active' },
      include: {
        targets: {
          where: { status: { in: ['contacted', 'viewed'] } },
          include: { buyer: { select: { name: true } } },
        },
        deal: {
          select: { property: { select: { address: true, city: true } } },
        },
      },
      take: 200,
    });
    let drafted = 0;
    for (const c of campaigns) {
      const eligible = await this.eligibility.evaluate(
        c.accountId,
        c.dealId,
        now,
      );
      if (eligible.status !== 'eligible') continue;
      for (const t of c.targets) {
        if (t.followUps >= c.maxFollowUps) continue;
        const last = t.lastActivityAt ?? t.contactedAt;
        if (!last || now.getTime() - last.getTime() < c.followUpDays * DAY_MS)
          continue;
        const link = t.shareLinkId
          ? await this.prisma.dealShareLink.findFirst({
              where: { id: t.shareLinkId, revokedAt: null },
            })
          : null;
        if (!link) continue;
        const property = c.deal.property
          ? `${c.deal.property.address}, ${c.deal.property.city}`
          : 'the property';
        const res = await this.messaging.email(c.accountId, {
          dealId: c.dealId,
          buyerId: t.buyerId,
          campaignId: c.id,
          type: 'disposition_follow_up',
          subject: `Re: ${c.outreachSubject}`,
          body:
            `Hi ${greetingName(t.buyer.name)},\n\n` +
            `Following up on ${property} at ${money(c.askingPrice)}. ` +
            `The details are still on the page we sent you. ` +
            `If it is not a fit, just reply and we will stop.\n\n${brandName()}`,
          approveAs: null,
        });
        if (res.status !== 'skipped') {
          drafted += 1;
          await this.prisma.dispositionTarget.update({
            where: { id: t.id },
            data: {
              followUps: { increment: 1 },
              lastActivityAt: now,
              lastMessageId: res.messageId ?? t.lastMessageId,
            },
          });
        }
      }
    }
    return drafted;
  }

  /** Campaigns stop when the contract can no longer be marketed or their time is up. */
  async expireCampaigns(now = new Date()) {
    const campaigns = await this.prisma.dispositionCampaign.findMany({
      where: { status: { in: ['active', 'paused'] } },
      select: {
        id: true,
        accountId: true,
        dealId: true,
        expiresAt: true,
        status: true,
        endedReason: true,
      },
      take: 500,
    });
    let expired = 0;
    for (const c of campaigns) {
      const timeUp = c.expiresAt && c.expiresAt.getTime() <= now.getTime();
      const e = await this.eligibility.evaluate(c.accountId, c.dealId, now);
      // A paused campaign whose buyer is signing is left alone unless the
      // contract itself is gone.
      const contractGone = e.checks.some(
        (x) =>
          (x.key === 'contract_live' || x.key === 'agreement_on_file') &&
          x.status === 'fail',
      );
      if (!timeUp && !contractGone) continue;
      if (
        c.status === 'paused' &&
        c.endedReason === 'buyer selected' &&
        !contractGone
      )
        continue;
      await this.prisma.dispositionCampaign.update({
        where: { id: c.id },
        data: {
          status: 'expired',
          endedAt: now,
          endedReason: contractGone
            ? 'seller contract no longer in force'
            : 'campaign period ended',
        },
      });
      await this.prisma.dealShareLink.updateMany({
        where: { campaignId: c.id, revokedAt: null },
        data: { revokedAt: now, revokedBy: 'system:expired' },
      });
      await dealEvent(
        this.timeline,
        c.accountId,
        c.dealId,
        'CAMPAIGN_EXPIRED',
        {
          campaignId: c.id,
          reason: contractGone ? e.summary : 'campaign period ended',
        },
        null,
      );
      expired += 1;
    }
    return expired;
  }
}

/** Contactable by email, not outside the buyer's stated area, best first. */
export function selectTargets(
  matches: BuyerMatch[],
  max: number,
): BuyerMatch[] {
  return matches
    .filter(
      (m) =>
        m.contactable &&
        m.channels.includes('email') &&
        !m.mismatches.some((x) => x.startsWith('outside stated locations')),
    )
    .slice(0, max);
}

export function campaignExpiry(
  closingDeadline: Date | null,
  now = new Date(),
): Date {
  const cap = new Date(now.getTime() + MAX_CAMPAIGN_DAYS * DAY_MS);
  if (!closingDeadline) return cap;
  const beforeDeadline = new Date(
    closingDeadline.getTime() - DEADLINE_BUFFER_DAYS * DAY_MS,
  );
  return beforeDeadline.getTime() < cap.getTime() ? beforeDeadline : cap;
}

/**
 * The outreach a person reviews. Only buyer-facing figures (the asking
 * price and labelled estimates); `{{name}}`, `{{why}}` and `{{link}}` are
 * filled per buyer.
 */
export function outreachTemplate(content: PackageContent): {
  subject: string;
  body: string;
} {
  const p = content.property;
  const lines = [
    `Hi {{name}},`,
    '',
    `We have ${p.address}, ${p.city}, ${p.state} ${p.zip} under contract and are offering to assign the contract.{{why}}`,
    '',
    `Price: ${money(content.price.askingPrice)} (assignment of contract)`,
  ];
  if (content.valuation.arv != null) {
    lines.push(
      `After-repair value: ${money(content.valuation.arv)} (our estimate${content.valuation.arvConfirmed ? '' : ', unconfirmed'})`,
    );
  }
  if (content.valuation.repairEstimate != null) {
    lines.push(
      `Repairs: about ${money(content.valuation.repairEstimate)} (our estimate)`,
    );
  }
  if (content.timeline.closeBy)
    lines.push(`Must close by: ${content.timeline.closeBy}`);
  lines.push(
    '',
    `Photos, details and disclosures: {{link}}`,
    '',
    `Reply with an offer or use the link. We hold a contract to buy this property; we are not the owner.`,
    '',
    content.seller,
  );
  return {
    subject: `${content.headline} - ${money(content.price.askingPrice)}`,
    body: lines.join('\n'),
  };
}

/** One buyer's copy of the outreach, with a reason that is true for them. */
export function personalize(
  template: string,
  input: { name: string; link: string; match: BuyerMatch | null },
): string {
  const m = input.match;
  let why = '';
  if (m) {
    if (m.components.trackRecord >= 7)
      why = ' You have bought near here recently, so it may fit.';
    else if (m.components.location >= 14)
      why = ' It is in an area you told us you buy in.';
    if (m.components.price === 20)
      why += why
        ? ' It is also in your price range.'
        : ' It is in your price range.';
  }
  return template
    .replace(/\{\{name\}\}/g, greetingName(input.name))
    .replace(/\{\{why\}\}/g, why)
    .replace(/\{\{link\}\}/g, input.link);
}
