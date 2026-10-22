import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { AuditService } from '../audit/audit.service';
import { DispositionEligibilityService } from './eligibility.service';
import { assertDealDocument } from './document-refs';
import { dealEvent } from './timeline-events';

export interface TaxSalePatch {
  interestType?: string;
  county?: string | null;
  auctionDate?: Date | null;
  advertisedPrice?: number | null;
  winningBid?: number | null;
  redemptionEndsAt?: Date | null;
  redeemed?: boolean;
  titleStatus?: string;
  transferable?: string;
  evidenceDocumentId?: string | null;
  notes?: string | null;
}

/** Changing any of these after verification means the verification no longer holds. */
const VERIFIED_FIELDS: Array<keyof TaxSalePatch> = [
  'interestType',
  'redemptionEndsAt',
  'redeemed',
  'titleStatus',
  'transferable',
  'evidenceDocumentId',
];

/**
 * Tax-sale deals (docs/contract-flipping.md s4). Recording one marks the deal
 * a tax-sale acquisition, which puts its interest check first in the
 * disposition gate. A person verifies the record against the deed and the
 * county and title records; nothing about a tax sale is assumed.
 */
@Injectable()
export class TaxSalesService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private audit: AuditService,
    private eligibility: DispositionEligibilityService,
  ) {}

  async get(accountId: string, dealId: string) {
    await this.dealRef(accountId, dealId);
    const record = await this.prisma.taxSaleInterest.findUnique({
      where: { dealId },
    });
    return {
      record: record && record.accountId === accountId ? record : null,
      eligibility: await this.eligibility.evaluate(accountId, dealId),
    };
  }

  async upsert(
    accountId: string,
    dealId: string,
    userId: string,
    patch: TaxSalePatch,
  ) {
    const deal = await this.dealRef(accountId, dealId);
    if (patch.evidenceDocumentId) {
      await assertDealDocument(
        this.prisma,
        accountId,
        patch.evidenceDocumentId,
        deal,
        'Tax-sale evidence',
      );
    }
    const existing = await this.prisma.taxSaleInterest.findUnique({
      where: { dealId },
    });
    if (existing && existing.accountId !== accountId)
      throw new NotFoundException(`Deal ${dealId} not found`);
    const norm = (v: unknown) =>
      v instanceof Date ? v.getTime() : (v ?? null);
    const invalidates =
      !!existing?.verifiedAt &&
      VERIFIED_FIELDS.some(
        (k) =>
          k in patch &&
          norm(patch[k]) !== norm((existing as Record<string, unknown>)[k]),
      );
    const record = existing
      ? await this.prisma.taxSaleInterest.update({
          where: { dealId },
          data: {
            ...patch,
            ...(invalidates ? { verifiedAt: null, verifiedBy: null } : {}),
          },
        })
      : await this.prisma.taxSaleInterest.create({
          data: { accountId, dealId, ...patch },
        });
    if (deal.acquisitionType !== 'tax_sale') {
      await this.prisma.deal.update({
        where: { id: dealId },
        data: { acquisitionType: 'tax_sale' },
      });
    }
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'TAX_SALE_RECORDED',
      {
        fields: Object.keys(patch),
        interestType: record.interestType,
        ...(invalidates ? { verificationCleared: true } : {}),
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  /**
   * A person confirms the tax-sale interest against the deed and the county
   * and title records. Refused unless it is a deed, redemption is over,
   * title is insurable, it is transferable and the evidence is on file.
   */
  async verify(
    accountId: string,
    dealId: string,
    userId: string,
    note?: string,
  ) {
    await this.dealRef(accountId, dealId);
    const r = await this.prisma.taxSaleInterest.findUnique({
      where: { dealId },
    });
    if (!r || r.accountId !== accountId) {
      throw new NotFoundException('Record the tax-sale interest first.');
    }
    const problems: string[] = [];
    if (r.interestType !== 'tax_deed')
      problems.push(
        `the interest is ${r.interestType.replace(/_/g, ' ')}, not a deed`,
      );
    if (r.redeemed) problems.push('the owner redeemed');
    if (!r.redemptionEndsAt)
      problems.push('the redemption period is not recorded');
    else if (r.redemptionEndsAt.getTime() > Date.now())
      problems.push('the redemption period has not ended');
    if (r.titleStatus !== 'insurable')
      problems.push(`title is ${r.titleStatus.replace(/_/g, ' ')}`);
    if (r.transferable !== 'yes')
      problems.push(`transferability is ${r.transferable}`);
    if (!r.evidenceDocumentId)
      problems.push('the deed or county record is not on file');
    if (problems.length) {
      throw new BadRequestException({
        code: 'TAX_SALE_NOT_VERIFIABLE',
        message: `This tax-sale interest cannot be verified: ${problems.join('; ')}.`,
        problems,
      });
    }
    await this.prisma.taxSaleInterest.update({
      where: { dealId },
      data: {
        verifiedAt: new Date(),
        verifiedBy: userId,
        ...(note ? { notes: [r.notes, note].filter(Boolean).join('\n') } : {}),
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'tax_sale.verify',
      resource: `deal:${dealId}`,
      details: {
        interestType: r.interestType,
        redemptionEndsAt: r.redemptionEndsAt,
        evidenceDocumentId: r.evidenceDocumentId,
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'TAX_SALE_VERIFIED',
      { evidenceDocumentId: r.evidenceDocumentId },
      userId,
    );
    return this.get(accountId, dealId);
  }

  private async dealRef(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: { id: true, leadId: true, acquisitionType: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    return deal;
  }
}
