import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { normalizeState } from '../compliance/disclosure-gate.service';
import { WHOLESALE_CHECKLIST } from '../documents/documents.checklist';

export interface PolicyPatch {
  assignmentAllowed?: string;
  doubleCloseAllowed?: string;
  licenseRequired?: string;
  licenseDocumentId?: string | null;
  publicMarketingAllowed?: string;
  buyerDisclosureKeys?: string[];
  sellerDisclosureKeys?: string[];
  conditions?: string | null;
  references?: string | null;
  notes?: string | null;
}

/** Fields whose change means the review no longer covers the policy. */
const REVIEWED_FIELDS: Array<keyof PolicyPatch> = [
  'assignmentAllowed',
  'doubleCloseAllowed',
  'licenseRequired',
  'publicMarketingAllowed',
  'buyerDisclosureKeys',
  'sellerDisclosureKeys',
  'conditions',
];

/**
 * Starting points for a state's policy: pointers for counsel to confirm,
 * never answers. A template fills in the paperwork Halo already tracks for
 * the state and the references to check; every legal question stays
 * `unknown` until a person records the answer and reviews the policy.
 */
export const POLICY_TEMPLATES: Record<
  string,
  { buyerDisclosureKeys: string[]; references: string; notes: string }
> = {
  TX: {
    buyerDisclosureKeys: ['equitable_interest_disclosure'],
    references:
      'To confirm with counsel: Tex. Prop. Code 5.086 (notice to buyers of an equitable interest); Tex. Occ. Code 1101.0045 (marketing an option or contract assignment without a license).',
    notes:
      'Halo already blocks Texas buyer marketing until the equitable-interest notice is on file for the deal. Confirm whether assignment is allowed for your operation, on what conditions, and whether a license is required.',
  },
};

/**
 * Jurisdiction policies (docs/contract-flipping.md s4). One per state per
 * tenant. A deal in a state without a reviewed policy is held for review by
 * the disposition gate; Halo never assumes a state allows wholesaling.
 */
@Injectable()
export class JurisdictionPoliciesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Every policy, plus the states of open deals that have no reviewed policy. */
  async list(accountId: string) {
    const [policies, deals] = await Promise.all([
      this.prisma.jurisdictionPolicy.findMany({
        where: { accountId },
        orderBy: { state: 'asc' },
      }),
      this.prisma.deal.findMany({
        where: {
          accountId,
          stage: {
            in: ['negotiating', 'under_contract', 'marketing', 'assigned'],
          },
        },
        select: {
          property: { select: { state: true } },
          lead: { select: { canonicalState: true } },
        },
      }),
    ]);
    const reviewed = new Set(
      policies.filter((p) => p.status === 'reviewed').map((p) => p.state),
    );
    const counts = new Map<string, number>();
    for (const d of deals) {
      const s = normalizeState(
        d.property?.state ?? d.lead?.canonicalState ?? null,
      );
      if (s && !reviewed.has(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return {
      policies,
      needsReview: Array.from(counts.entries())
        .map(([state, openDeals]) => ({ state, openDeals }))
        .sort((a, b) => b.openDeals - a.openDeals),
      templates: Object.keys(POLICY_TEMPLATES),
      checklistKeys: WHOLESALE_CHECKLIST.map((i) => ({
        key: i.key,
        title: i.title,
      })),
    };
  }

  async get(accountId: string, state: string) {
    const policy = await this.prisma.jurisdictionPolicy.findUnique({
      where: { accountId_state: { accountId, state } },
    });
    return {
      policy,
      template: POLICY_TEMPLATES[state] ?? null,
    };
  }

  /**
   * Create or edit a policy. Editing what a review covered puts the policy
   * back to draft: the old review did not see the new answer.
   */
  async upsert(
    accountId: string,
    state: string,
    userId: string,
    patch: PolicyPatch,
  ) {
    this.assertChecklistKeys(patch.buyerDisclosureKeys);
    this.assertChecklistKeys(patch.sellerDisclosureKeys);
    if (patch.licenseDocumentId) {
      const doc = await this.prisma.document.findFirst({
        where: { id: patch.licenseDocumentId, accountId, status: 'active' },
        select: { id: true },
      });
      if (!doc)
        throw new BadRequestException(
          'The licence document is not in the library.',
        );
    }
    const existing = await this.prisma.jurisdictionPolicy.findUnique({
      where: { accountId_state: { accountId, state } },
    });
    const invalidates =
      existing?.status === 'reviewed' &&
      REVIEWED_FIELDS.some((k) => {
        if (!(k in patch)) return false;
        return (
          JSON.stringify(patch[k] ?? null) !==
          JSON.stringify((existing as Record<string, unknown>)[k] ?? null)
        );
      });
    const policy = existing
      ? await this.prisma.jurisdictionPolicy.update({
          where: { id: existing.id },
          data: {
            ...patch,
            updatedBy: userId,
            ...(invalidates
              ? { status: 'draft', reviewedAt: null, reviewedBy: null }
              : {}),
          },
        })
      : await this.prisma.jurisdictionPolicy.create({
          data: {
            accountId,
            state,
            ...patch,
            buyerDisclosureKeys: patch.buyerDisclosureKeys ?? [],
            sellerDisclosureKeys: patch.sellerDisclosureKeys ?? [],
            updatedBy: userId,
          },
        });
    await this.audit.log({
      accountId,
      userId,
      action: existing
        ? 'jurisdiction_policy.update'
        : 'jurisdiction_policy.create',
      resource: `jurisdiction_policy:${state}`,
      details: { ...patch, reviewCleared: !!invalidates },
    });
    return policy;
  }

  /** Start a draft from the state's template. */
  async fromTemplate(accountId: string, state: string, userId: string) {
    const t = POLICY_TEMPLATES[state];
    if (!t) throw new NotFoundException(`No template for ${state}`);
    const existing = await this.prisma.jurisdictionPolicy.findUnique({
      where: { accountId_state: { accountId, state } },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(
        `A ${state} policy already exists; edit it instead.`,
      );
    }
    return this.upsert(accountId, state, userId, {
      buyerDisclosureKeys: t.buyerDisclosureKeys,
      references: t.references,
      notes: t.notes,
    });
  }

  /**
   * Mark the policy reviewed: a person confirms the answers on it, citing
   * what they relied on. Refused while the two questions the gate turns on
   * (is assignment allowed, is a licence required) are still unknown.
   */
  async review(
    accountId: string,
    state: string,
    userId: string,
    input: { references: string; reviewExpiresAt?: Date },
  ) {
    const existing = await this.prisma.jurisdictionPolicy.findUnique({
      where: { accountId_state: { accountId, state } },
    });
    if (!existing) throw new NotFoundException(`No ${state} policy to review`);
    const unknown = [
      existing.assignmentAllowed === 'unknown' &&
        'whether assignment is allowed',
      existing.licenseRequired === 'unknown' && 'whether a licence is required',
    ].filter(Boolean);
    if (unknown.length) {
      throw new BadRequestException(
        `A review must answer ${unknown.join(' and ')}. Record the answers first.`,
      );
    }
    if (existing.assignmentAllowed === 'conditional' && !existing.conditions) {
      throw new BadRequestException(
        'Write down the conditions under which assignment is allowed.',
      );
    }
    if (
      input.reviewExpiresAt &&
      input.reviewExpiresAt.getTime() <= Date.now()
    ) {
      throw new BadRequestException('The review expiry must be in the future.');
    }
    const policy = await this.prisma.jurisdictionPolicy.update({
      where: { id: existing.id },
      data: {
        status: 'reviewed',
        references: input.references,
        reviewedAt: new Date(),
        reviewedBy: userId,
        reviewExpiresAt: input.reviewExpiresAt ?? null,
        updatedBy: userId,
      },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'jurisdiction_policy.review',
      resource: `jurisdiction_policy:${state}`,
      details: {
        assignmentAllowed: policy.assignmentAllowed,
        licenseRequired: policy.licenseRequired,
        buyerDisclosureKeys: policy.buyerDisclosureKeys,
        references: input.references,
        reviewExpiresAt: input.reviewExpiresAt?.toISOString() ?? null,
      },
    });
    return policy;
  }

  async retire(accountId: string, state: string, userId: string) {
    const existing = await this.prisma.jurisdictionPolicy.findUnique({
      where: { accountId_state: { accountId, state } },
    });
    if (!existing) throw new NotFoundException(`No ${state} policy`);
    const policy = await this.prisma.jurisdictionPolicy.update({
      where: { id: existing.id },
      data: { status: 'retired', updatedBy: userId },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'jurisdiction_policy.retire',
      resource: `jurisdiction_policy:${state}`,
    });
    return policy;
  }

  private assertChecklistKeys(keys?: string[]) {
    if (!keys) return;
    const known = new Set(WHOLESALE_CHECKLIST.map((i) => i.key));
    const bad = keys.filter((k) => !known.has(k));
    if (bad.length) {
      throw new BadRequestException(
        `Unknown checklist item(s): ${bad.join(', ')}. Use the keys from the compliance checklist.`,
      );
    }
  }
}
