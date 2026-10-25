import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ComplianceBlockedException } from './compliance-blocked.exception';

/** The checklist tag a document carries when it is the Texas notice. */
export const EQUITABLE_INTEREST_TAG = 'checklist:equitable_interest_disclosure';
export const EQUITABLE_INTEREST_REASON = 'TX_EQUITABLE_INTEREST_DISCLOSURE';

export interface DisclosureStatus {
  /** Whether the deal's state requires the notice before buyer marketing. */
  required: boolean;
  /** Whether an active disclosure document is on file for the deal or its lead. */
  satisfied: boolean;
  state: string | null;
  documentId?: string;
}

const STATE_NAMES: Record<string, string> = { TEXAS: 'TX' };

export function normalizeState(
  value: string | null | undefined,
): string | null {
  const v = (value ?? '').trim().toUpperCase();
  if (!v) return null;
  return STATE_NAMES[v] ?? v;
}

/**
 * Texas lets a wholesaler market only an equitable interest, and requires
 * written notice of that to every prospective buyer (Tex. Prop. Code 5.0205,
 * Tex. Occ. Code 1101.0045). This gate keeps buyer marketing and buyer
 * contracts for a Texas deal from going out until the notice is on file in
 * the documents library, attached to the deal or its lead and tagged with
 * the checklist item. The wording of the notice is the operator's (and
 * counsel's); the gate only checks that it exists.
 */
@Injectable()
export class DisclosureGateService {
  constructor(private prisma: PrismaService) {}

  async equitableInterest(
    accountId: string,
    dealId: string,
  ): Promise<DisclosureStatus> {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        id: true,
        leadId: true,
        property: { select: { state: true } },
        lead: { select: { canonicalState: true } },
      },
    });
    if (!deal) return { required: false, satisfied: true, state: null };
    const state = normalizeState(
      deal.property?.state ?? deal.lead?.canonicalState ?? null,
    );
    if (state !== 'TX') return { required: false, satisfied: true, state };
    // With every state open on the owner's own legal judgment
    // (docs/markets.md s12), the notice is the owner's to give; Halo does
    // not hold buyer marketing for it.
    const cp = await this.prisma.controlPlane.findUnique({
      where: { accountId },
      select: { nationwideOpenedAt: true },
    });
    if (cp?.nationwideOpenedAt)
      return { required: false, satisfied: true, state };

    const doc = await this.prisma.document.findFirst({
      where: {
        accountId,
        status: 'active',
        tags: { has: EQUITABLE_INTEREST_TAG },
        OR: [
          { dealId: deal.id },
          ...(deal.leadId ? [{ leadId: deal.leadId }] : []),
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return {
      required: true,
      satisfied: !!doc,
      state,
      ...(doc ? { documentId: doc.id } : {}),
    };
  }

  /** Throws a compliance block (403) when the notice is required and missing. */
  async assertEquitableInterest(
    accountId: string,
    dealId: string,
    action: string,
  ): Promise<DisclosureStatus> {
    const status = await this.equitableInterest(accountId, dealId);
    if (status.required && !status.satisfied) {
      throw new ComplianceBlockedException(
        EQUITABLE_INTEREST_REASON,
        `Texas requires the equitable-interest disclosure before ${action}. Upload it on the Documents page, attached to this deal, with the checklist item "Equitable interest disclosure (Texas)", then try again.`,
        { dealId, state: status.state },
      );
    }
    return status;
  }
}
