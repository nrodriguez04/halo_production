import { Injectable, NotFoundException } from '@nestjs/common';
import {
  evaluateDispositionEligibility,
  eligibilitySummary,
  type AcquisitionType,
  type Assignability,
  type DispositionEligibility,
  type JurisdictionPolicyStatus,
  type PermissionValue,
  type PurchaseAgreementStatus,
  type RequiredDisclosure,
  type TaxSaleInterestType,
  type TaxSaleTitleStatus,
  type TriState,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { ComplianceBlockedException } from '../compliance/compliance-blocked.exception';
import { normalizeState } from '../compliance/disclosure-gate.service';
import {
  CHECKLIST_TAG_PREFIX,
  WHOLESALE_CHECKLIST,
} from '../documents/documents.checklist';

export const DISPOSITION_NOT_ELIGIBLE = 'DISPOSITION_NOT_ELIGIBLE';

/** Disclosures Halo requires before buyer marketing whatever the tenant's policy says. */
const BUILT_IN_BUYER_DISCLOSURES: Record<string, string[]> = {
  // Tex. Prop. Code 5.086 / Tex. Occ. Code 1101.0045; the existing gate
  // (DisclosureGateService) enforces the same document at every send.
  TX: ['equitable_interest_disclosure'],
};

export interface DealEligibility extends DispositionEligibility {
  dealId: string;
  agreementId: string | null;
  summary: string;
}

const AGREEMENT_SELECT = {
  id: true,
  status: true,
  executedAt: true,
  executedDocumentId: true,
  verifiedAt: true,
  assignability: true,
  sellerConsentDocumentId: true,
  closingDeadline: true,
  earnestMoneyAmount: true,
  earnestMoneyDueAt: true,
  earnestMoneyDepositedAt: true,
} as const;

/**
 * The disposition gate in the api: loads what Halo has on record for a deal
 * and asks the shared evaluator whether it may be marketed and assigned.
 * Every buyer-facing step (entering marketing, launching a campaign, a
 * buyer page, sending buyer marketing, accepting an offer, preparing an
 * assignment) calls `assertEligible` first.
 */
@Injectable()
export class DispositionEligibilityService {
  constructor(private prisma: PrismaService) {}

  /** The seller contract Halo is currently relying on: the newest one. */
  async currentAgreement(accountId: string, dealId: string) {
    return this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async evaluate(
    accountId: string,
    dealId: string,
    now = new Date(),
  ): Promise<DealEligibility> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        id: true,
        leadId: true,
        acquisitionType: true,
        taxSaleInterest: true,
        property: { select: { state: true } },
        lead: { select: { canonicalState: true } },
      },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    const t = deal.taxSaleInterest;
    const state = normalizeState(
      deal.property?.state ?? deal.lead?.canonicalState ?? null,
    );

    const [agreement, policy, issues] = await Promise.all([
      this.prisma.purchaseAgreement.findFirst({
        where: { accountId, dealId },
        orderBy: { createdAt: 'desc' },
        select: AGREEMENT_SELECT,
      }),
      state
        ? this.prisma.jurisdictionPolicy.findUnique({
            where: { accountId_state: { accountId, state } },
          })
        : Promise.resolve(null),
      this.prisma.closingIssue.findMany({
        where: { accountId, dealId, status: 'open', severity: 'blocking' },
        select: { kind: true, description: true },
      }),
    ]);

    const requiredKeys = new Set<string>([
      ...(state ? (BUILT_IN_BUYER_DISCLOSURES[state] ?? []) : []),
      ...(policy?.status === 'reviewed' ? policy.buyerDisclosureKeys : []),
    ]);
    const disclosures = await this.disclosuresOnFile(
      accountId,
      deal.id,
      deal.leadId,
      Array.from(requiredKeys),
    );
    const licenseOnFile = policy?.licenseDocumentId
      ? !!(await this.prisma.document.findFirst({
          where: {
            id: policy.licenseDocumentId,
            accountId,
            status: 'active',
          },
          select: { id: true },
        }))
      : false;

    const result = evaluateDispositionEligibility({
      now,
      acquisitionType: deal.acquisitionType as AcquisitionType,
      taxSale: t
        ? {
            interestType: t.interestType as TaxSaleInterestType,
            redemptionEndsAt: t.redemptionEndsAt,
            redeemed: t.redeemed,
            titleStatus: t.titleStatus as TaxSaleTitleStatus,
            transferable: t.transferable as 'yes' | 'no' | 'unknown',
            verifiedAt: t.verifiedAt,
          }
        : null,
      state,
      agreement: agreement
        ? {
            status: agreement.status as PurchaseAgreementStatus,
            executedAt: agreement.executedAt,
            executedDocumentId: agreement.executedDocumentId,
            verifiedAt: agreement.verifiedAt,
            assignability: agreement.assignability as Assignability,
            sellerConsentDocumentId: agreement.sellerConsentDocumentId,
            closingDeadline: agreement.closingDeadline,
            earnestMoneyAmount: agreement.earnestMoneyAmount,
            earnestMoneyDueAt: agreement.earnestMoneyDueAt,
            earnestMoneyDepositedAt: agreement.earnestMoneyDepositedAt,
          }
        : null,
      policy: policy
        ? {
            status: policy.status as JurisdictionPolicyStatus,
            assignmentAllowed: policy.assignmentAllowed as PermissionValue,
            licenseRequired: policy.licenseRequired as TriState,
            licenseOnFile,
            buyerDisclosureKeys: policy.buyerDisclosureKeys,
            reviewExpiresAt: policy.reviewExpiresAt,
            conditions: policy.conditions,
          }
        : null,
      disclosures,
      blockingIssues: issues,
    });
    return {
      ...result,
      dealId: deal.id,
      agreementId: agreement?.id ?? null,
      summary: eligibilitySummary(result),
    };
  }

  /**
   * Throws a compliance block (403, DISPOSITION_NOT_ELIGIBLE) with every
   * check, so the caller can show exactly what to fix.
   */
  async assertEligible(
    accountId: string,
    dealId: string,
    action: string,
  ): Promise<DealEligibility> {
    const e = await this.evaluate(accountId, dealId);
    if (e.status !== 'eligible') {
      throw new ComplianceBlockedException(
        DISPOSITION_NOT_ELIGIBLE,
        `This deal cannot be used for ${action}. ${e.summary}`,
        { dealId, eligibility: e.status, checks: e.checks },
      );
    }
    return e;
  }

  /** Which of the required checklist items are on file for the deal or its lead. */
  async disclosuresOnFile(
    accountId: string,
    dealId: string,
    leadId: string | null,
    keys: string[],
  ): Promise<RequiredDisclosure[]> {
    if (keys.length === 0) return [];
    const tags = keys.map((k) => `${CHECKLIST_TAG_PREFIX}${k}`);
    const docs = await this.prisma.document.findMany({
      where: {
        accountId,
        status: 'active',
        tags: { hasSome: tags },
        OR: [{ dealId }, ...(leadId ? [{ leadId }] : [])],
      },
      select: { tags: true },
    });
    const have = new Set(docs.flatMap((d) => d.tags));
    return keys.map((key) => ({
      key,
      title: WHOLESALE_CHECKLIST.find((i) => i.key === key)?.title ?? key,
      satisfied: have.has(`${CHECKLIST_TAG_PREFIX}${key}`),
    }));
  }
}
