import {
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma.service';
import { DispositionEligibilityService } from './eligibility.service';

const DEFAULT_TTL_DAYS = 21;

export function hashShareToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * The web app's public origin, where buyer deal pages live
 * (`/p/deals/<token>`). PUBLIC_APP_URL, else the first CORS origin, which
 * is the app in every deployment so far.
 */
export function publicAppUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const explicit = env.PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const cors = env.CORS_ORIGINS?.split(',')
    .map((s) => s.trim())
    .find((s) => /^https?:\/\//.test(s));
  return cors ? cors.replace(/\/+$/, '') : null;
}

/**
 * Buyer links (docs/contract-flipping.md s5). The token is shown once, in
 * the link; only its hash is stored. A link opens nothing once it expires,
 * is revoked, its campaign ends, or the deal stops being eligible.
 */
@Injectable()
export class ShareLinksService {
  constructor(
    private prisma: PrismaService,
    private eligibility: DispositionEligibilityService,
  ) {}

  async create(
    accountId: string,
    input: {
      dealId: string;
      packageId: string;
      campaignId?: string | null;
      buyerId?: string | null;
      expiresAt?: Date;
    },
    userId: string | null,
  ): Promise<{ id: string; url: string; expiresAt: Date }> {
    const base = publicAppUrl();
    if (!base) {
      throw new ServiceUnavailableException({
        code: 'NOT_CONFIGURED',
        message:
          'Set PUBLIC_APP_URL to the web app origin so buyer links can be created.',
      });
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + DEFAULT_TTL_DAYS * 24 * 60 * 60 * 1000);
    const link = await this.prisma.dealShareLink.create({
      data: {
        accountId,
        dealId: input.dealId,
        packageId: input.packageId,
        campaignId: input.campaignId ?? null,
        buyerId: input.buyerId ?? null,
        tokenHash: hashShareToken(token),
        expiresAt,
        createdBy: userId,
      },
    });
    return { id: link.id, url: `${base}/p/deals/${token}`, expiresAt };
  }

  async revoke(accountId: string, linkId: string, userId: string) {
    const link = await this.prisma.dealShareLink.findFirst({
      where: { id: linkId, accountId },
    });
    if (!link) throw new NotFoundException(`Link ${linkId} not found`);
    return this.prisma.dealShareLink.update({
      where: { id: link.id },
      data: {
        revokedAt: link.revokedAt ?? new Date(),
        revokedBy: link.revokedBy ?? userId,
      },
    });
  }

  async list(accountId: string, dealId: string) {
    return this.prisma.dealShareLink.findMany({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        buyerId: true,
        campaignId: true,
        packageId: true,
        expiresAt: true,
        revokedAt: true,
        viewCount: true,
        firstViewedAt: true,
        lastViewedAt: true,
        createdAt: true,
      },
    });
  }

  /**
   * The link behind a token, if it may still be used. Refusals say only
   * that the opportunity is unavailable: a buyer learns nothing about why.
   */
  async resolve(token: string, now = new Date()) {
    if (!token || token.length < 20 || token.length > 100) {
      throw new NotFoundException('This link is not valid.');
    }
    const link = await this.prisma.dealShareLink.findUnique({
      where: { tokenHash: hashShareToken(token) },
    });
    if (!link) throw new NotFoundException('This link is not valid.');
    const gone = () =>
      new GoneException('This opportunity is no longer available.');
    if (link.revokedAt || link.expiresAt.getTime() <= now.getTime())
      throw gone();
    if (link.campaignId) {
      const campaign = await this.prisma.dispositionCampaign.findFirst({
        where: { id: link.campaignId, accountId: link.accountId },
        select: { status: true },
      });
      if (!campaign || campaign.status !== 'active') throw gone();
    }
    const eligibility = await this.eligibility.evaluate(
      link.accountId,
      link.dealId,
      now,
    );
    if (eligibility.status !== 'eligible') throw gone();
    // Buyers always see the current approved package, not the one the link
    // was made with: the price may have changed since.
    const pkg = await this.prisma.dealPackage.findFirst({
      where: {
        accountId: link.accountId,
        dealId: link.dealId,
        status: 'approved',
      },
      orderBy: { version: 'desc' },
    });
    if (!pkg) throw gone();
    return { link, pkg };
  }

  async recordView(linkId: string, now = new Date()) {
    const link = await this.prisma.dealShareLink.update({
      where: { id: linkId },
      data: {
        viewCount: { increment: 1 },
        lastViewedAt: now,
      },
    });
    if (!link.firstViewedAt) {
      await this.prisma.dealShareLink.update({
        where: { id: linkId },
        data: { firstViewedAt: now },
      });
    }
    return link;
  }
}
