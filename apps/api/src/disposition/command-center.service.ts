import { Injectable } from '@nestjs/common';
import { AutomationRunStatus } from '@prisma/client';
import type { DispositionEligibility } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { DealsService } from '../deals/deals.service';
import { BuyerIntelligenceService } from '../buyers/buyer-intelligence.service';
import type { PiiViewer } from '../auth/pii-access';
import { DispositionEligibilityService } from './eligibility.service';
import { ClosingService } from './closing.service';
import { CampaignsService } from './campaigns.service';
import { OffersService } from './offers.service';
import { DealPackagesService } from './deal-packages.service';
import { AssignmentsService } from './assignments.service';
import { ShareLinksService } from './share-links.service';

export type NextActionKind =
  | 'record_agreement'
  | 'execute_agreement'
  | 'verify_agreement'
  | 'fix_gate'
  | 'review_policy'
  | 'prepare_campaign'
  | 'approve_campaign'
  | 'decide_offers'
  | 'confirm_offer'
  | 'send_assignment'
  | 'record_assignment'
  | 'closing_attention'
  | 'confirm_closing'
  | 'record_fee'
  | 'approve_drafts';

export interface NextAction {
  kind: NextActionKind;
  title: string;
  detail: string;
  /** Lower is more urgent. */
  priority: number;
}

const ACTIVE_STAGES = [
  'negotiating',
  'under_contract',
  'marketing',
  'assigned',
];

/**
 * The Deal Command Center (docs/contract-flipping.md s7): one read that
 * gives the deal page everything it shows, and the few actions that move
 * the deal, worked out from its state. The same rules feed the cross-deal
 * attention list, so what the dashboard says needs doing is what the deal
 * page offers to do.
 */
@Injectable()
export class CommandCenterService {
  constructor(
    private prisma: PrismaService,
    private deals: DealsService,
    private buyers: BuyerIntelligenceService,
    private eligibility: DispositionEligibilityService,
    private closing: ClosingService,
    private campaigns: CampaignsService,
    private offers: OffersService,
    private packages: DealPackagesService,
    private assignments: AssignmentsService,
    private links: ShareLinksService,
  ) {}

  async workspace(
    accountId: string,
    dealId: string,
    viewer?: PiiViewer | null,
  ) {
    const deal = await this.deals.findOne(dealId, accountId, { viewer });
    const [
      eligibility,
      agreements,
      closing,
      campaigns,
      offers,
      matches,
      packages,
      assignments,
      links,
      runs,
      drafts,
    ] = await Promise.all([
      this.eligibility.evaluate(accountId, dealId),
      this.prisma.purchaseAgreement.findMany({
        where: { accountId, dealId },
        orderBy: { createdAt: 'desc' },
      }),
      this.closing.get(accountId, dealId),
      this.campaigns.listForDeal(accountId, dealId),
      this.offers
        .list(accountId, dealId)
        .catch(() => ({ offers: [], pricing: null })),
      this.buyers
        .rankForDeal(accountId, dealId, { limit: 15 })
        .catch(() => null),
      this.packages.list(accountId, dealId),
      this.assignments.listForDeal(accountId, dealId),
      this.links.list(accountId, dealId),
      this.prisma.automationRun.findMany({
        where: {
          tenantId: accountId,
          entityType: 'deal',
          entityId: dealId,
          status: AutomationRunStatus.AWAITING_APPROVAL,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          agentName: true,
          createdAt: true,
          decisionJson: true,
        },
      }),
      this.prisma.message.findMany({
        where: { accountId, dealId, status: 'pending_approval' },
        orderBy: { createdAt: 'desc' },
        select: { id: true, channel: true, createdAt: true, metadata: true },
        take: 50,
      }),
    ]);
    const agreement = agreements[0] ?? null;
    const activeAssignment =
      assignments.find((a) => a.status !== 'cancelled') ?? null;
    const economics = deal.economics;
    const pricing = offers.pricing?.recommendation ?? null;
    const projectedFee =
      activeAssignment?.assignmentFee ??
      (pricing ? pricing.recommendedFee : (economics?.assignmentFee ?? null));
    const nextActions = deriveNextActions({
      stage: deal.stage,
      agreement,
      eligibility,
      campaigns: campaigns.map((c) => ({ status: c.status })),
      openOffers: offers.offers.filter(
        (o) => o.status === 'received' || o.status === 'countered',
      ),
      assignment: activeAssignment,
      closing: closing
        ? {
            status: closing.status,
            readiness: closing.readiness,
            feeReceivedAt: closing.feeReceivedAt,
          }
        : null,
      pendingRuns: runs.length,
      pendingDrafts: drafts.length,
    });
    return {
      deal,
      eligibility,
      agreement,
      agreementHistory: agreements
        .slice(1)
        .map((a) => ({ id: a.id, status: a.status, createdAt: a.createdAt })),
      closing,
      campaigns,
      offers: offers.offers,
      pricing,
      matches: matches?.matches ?? [],
      buyersConsidered: matches?.considered ?? 0,
      packages,
      assignments,
      links,
      approvals: {
        agentRuns: runs.map((r) => ({
          id: r.id,
          agent: r.agentName,
          createdAt: r.createdAt,
          summary:
            (r.decisionJson as Record<string, unknown> | null)?.summary ?? null,
        })),
        messages: drafts.map((m) => ({
          id: m.id,
          channel: m.channel,
          createdAt: m.createdAt,
          type: (m.metadata as Record<string, unknown> | null)?.type ?? null,
          buyerName:
            (m.metadata as Record<string, unknown> | null)?.buyerName ?? null,
        })),
      },
      economics: {
        contractPrice:
          agreement?.purchasePrice ?? economics?.contractPrice ?? null,
        askingPrice:
          campaigns.find((c) => c.status === 'active')?.askingPrice ??
          deal.buyerPrice?.price ??
          null,
        projectedFee,
        projectedNet:
          projectedFee != null && offers.pricing
            ? projectedFee - offers.pricing.input.transactionCosts
            : null,
        realizedFee: economics?.realizedFee ?? null,
        realizedAt: economics?.realizedAt ?? null,
        revenueStatus: economics?.revenueStatus ?? 'projected',
      },
      nextActions,
    };
  }

  /** Everything across the portfolio that waits on a person, most urgent first. */
  async attention(accountId: string, now = new Date()) {
    const deals = await this.prisma.deal.findMany({
      where: { accountId, stage: { in: ACTIVE_STAGES } },
      select: {
        id: true,
        stage: true,
        property: { select: { address: true, city: true, state: true } },
      },
      take: 300,
      orderBy: { updatedAt: 'desc' },
    });
    const items: Array<
      NextAction & { dealId: string; property: string; stage: string }
    > = [];
    for (const d of deals) {
      const [
        eligibility,
        agreement,
        campaigns,
        openOffers,
        assignment,
        closing,
        runs,
        drafts,
      ] = await Promise.all([
        this.eligibility.evaluate(accountId, d.id, now),
        this.eligibility.currentAgreement(accountId, d.id),
        this.prisma.dispositionCampaign.findMany({
          where: { accountId, dealId: d.id },
          select: { status: true },
        }),
        this.prisma.buyerOffer.findMany({
          where: {
            accountId,
            dealId: d.id,
            status: { in: ['received', 'countered'] },
          },
          select: { id: true, capturedBy: true, confirmedAt: true },
        }),
        this.prisma.assignmentAgreement.findFirst({
          where: { accountId, dealId: d.id, status: { not: 'cancelled' } },
          orderBy: { createdAt: 'desc' },
        }),
        this.closing.get(accountId, d.id, now),
        this.prisma.automationRun.count({
          where: {
            tenantId: accountId,
            entityType: 'deal',
            entityId: d.id,
            status: AutomationRunStatus.AWAITING_APPROVAL,
          },
        }),
        this.prisma.message.count({
          where: { accountId, dealId: d.id, status: 'pending_approval' },
        }),
      ]);
      const actions = deriveNextActions({
        stage: d.stage,
        agreement,
        eligibility,
        campaigns,
        openOffers,
        assignment,
        closing: closing
          ? {
              status: closing.status,
              readiness: closing.readiness,
              feeReceivedAt: closing.feeReceivedAt,
            }
          : null,
        pendingRuns: runs,
        pendingDrafts: drafts,
      });
      const property = d.property
        ? `${d.property.address}, ${d.property.city}`
        : d.id;
      for (const a of actions)
        items.push({ ...a, dealId: d.id, property, stage: d.stage });
    }
    // Closed deals whose fee has not arrived are still owed.
    const awaitingFee = await this.prisma.closingFile.findMany({
      where: { accountId, status: 'closed', feeReceivedAt: null },
      select: {
        dealId: true,
        closedAt: true,
        realizedFee: true,
        deal: {
          select: { property: { select: { address: true, city: true } } },
        },
      },
    });
    for (const f of awaitingFee) {
      items.push({
        kind: 'record_fee',
        title: 'Record the assignment fee received',
        detail: `Closed ${f.closedAt?.toISOString().slice(0, 10) ?? ''}; the fee is projected until it is recorded as received.`,
        priority: 30,
        dealId: f.dealId,
        property: f.deal.property
          ? `${f.deal.property.address}, ${f.deal.property.city}`
          : f.dealId,
        stage: 'closed',
      });
    }
    return items.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Portfolio reporting. Projected and realized money are never added
   * together: projected is what accepted assignments and live asking prices
   * would pay; realized is what closing files record as received.
   */
  async portfolio(accountId: string, now = new Date()) {
    const [
      stageCounts,
      agreements,
      campaigns,
      offers,
      assignments,
      closings,
      runs,
    ] = await Promise.all([
      this.prisma.deal.groupBy({
        by: ['stage'],
        where: { accountId },
        _count: { _all: true },
      }),
      this.prisma.purchaseAgreement.findMany({
        where: { accountId },
        select: {
          dealId: true,
          status: true,
          executedAt: true,
          verifiedAt: true,
        },
      }),
      this.prisma.dispositionCampaign.findMany({
        where: { accountId },
        select: {
          id: true,
          dealId: true,
          status: true,
          launchedAt: true,
          askingPrice: true,
          floorPrice: true,
          targets: { select: { status: true } },
        },
      }),
      this.prisma.buyerOffer.findMany({
        where: { accountId },
        select: { dealId: true, status: true, amount: true },
      }),
      this.prisma.assignmentAgreement.findMany({
        where: { accountId },
        select: {
          dealId: true,
          status: true,
          assignmentFee: true,
          cancellationReason: true,
        },
      }),
      this.prisma.closingFile.findMany({
        where: { accountId },
        select: {
          dealId: true,
          status: true,
          openedAt: true,
          closedAt: true,
          realizedFee: true,
          feeReceivedAt: true,
          revenueRecognizedAt: true,
          expectedFee: true,
        },
      }),
      this.prisma.automationRun.findMany({
        where: {
          tenantId: accountId,
          source: 'agent',
          createdAt: { gte: new Date(now.getTime() - 90 * 86_400_000) },
        },
        select: {
          agentName: true,
          status: true,
          approvedAt: true,
          decisionJson: true,
          aiCostUsd: true,
        },
      }),
    ]);
    const stages = Object.fromEntries(
      stageCounts.map((s) => [s.stage, s._count._all]),
    );
    const launched = campaigns.filter((c) => c.launchedAt);
    const dealsWithOffers = new Set(offers.map((o) => o.dealId));
    const dealsAccepted = new Set(assignments.map((a) => a.dealId));
    const closedFiles = closings.filter((c) => c.status === 'closed');
    const executed = new Map(
      agreements
        .filter((a) => a.executedAt)
        .map((a) => [a.dealId, a.executedAt as Date]),
    );
    const cycleDays = closedFiles
      .map((c) => {
        const start = executed.get(c.dealId) ?? c.openedAt;
        return c.closedAt
          ? (c.closedAt.getTime() - start.getTime()) / 86_400_000
          : null;
      })
      .filter((n): n is number => n != null && n >= 0);
    const liveAssignments = assignments.filter(
      (a) =>
        a.status !== 'cancelled' &&
        !closedFiles.some((c) => c.dealId === a.dealId),
    );
    const realized = closings.filter(
      (c) => c.revenueRecognizedAt && c.realizedFee != null,
    );
    const agentStats = new Map<
      string,
      {
        runs: number;
        awaiting: number;
        approved: number;
        rejected: number;
        failed: number;
        costUsd: number;
      }
    >();
    for (const r of runs) {
      const key = r.agentName ?? 'unknown';
      const s = agentStats.get(key) ?? {
        runs: 0,
        awaiting: 0,
        approved: 0,
        rejected: 0,
        failed: 0,
        costUsd: 0,
      };
      s.runs += 1;
      s.costUsd += r.aiCostUsd ?? 0;
      if (r.status === 'AWAITING_APPROVAL') s.awaiting += 1;
      if (r.status === 'FAILED') s.failed += 1;
      if (r.approvedAt) s.approved += 1;
      if ((r.decisionJson as Record<string, unknown> | null)?.rejection)
        s.rejected += 1;
      agentStats.set(key, s);
    }
    return {
      asOf: now.toISOString(),
      pipeline: {
        activeOpportunities:
          (stages.new ?? 0) +
          (stages.contacted ?? 0) +
          (stages.negotiating ?? 0),
        underContract:
          (stages.under_contract ?? 0) +
          (stages.marketing ?? 0) +
          (stages.assigned ?? 0),
        awaitingVerification: agreements.filter(
          (a) => a.status === 'executed' && !a.verifiedAt,
        ).length,
        marketing: stages.marketing ?? 0,
        assigned: stages.assigned ?? 0,
        closed: stages.closed ?? 0,
        lost: stages.lost ?? 0,
        byStage: stages,
      },
      disposition: {
        campaignsLaunched: launched.length,
        buyersContacted: launched.reduce(
          (n, c) =>
            n +
            c.targets.filter((t) => !['selected', 'skipped'].includes(t.status))
              .length,
          0,
        ),
        buyersInterested: launched.reduce(
          (n, c) =>
            n +
            c.targets.filter((t) =>
              ['interested', 'offered'].includes(t.status),
            ).length,
          0,
        ),
        dealsWithOffers: dealsWithOffers.size,
        dealsWithAcceptedOffer: dealsAccepted.size,
        dealsClosed: closedFiles.length,
        offerRate: launched.length
          ? round(
              launched.filter((c) => dealsWithOffers.has(c.dealId)).length /
                launched.length,
            )
          : null,
        closeRate: launched.length
          ? round(
              launched.filter((c) =>
                closedFiles.some((f) => f.dealId === c.dealId),
              ).length / launched.length,
            )
          : null,
      },
      money: {
        projected: {
          note: 'Accepted assignments not yet closed, at their agreed fee. Not revenue.',
          assignmentFees: sum(liveAssignments.map((a) => a.assignmentFee)),
          deals: liveAssignments.length,
        },
        closedAwaitingFunds: {
          note: 'Closed, fee shown on the settlement statement, not yet recorded as received.',
          amount: sum(
            closings
              .filter((c) => c.status === 'closed' && !c.revenueRecognizedAt)
              .map((c) => c.realizedFee ?? c.expectedFee ?? 0),
          ),
          deals: closings.filter(
            (c) => c.status === 'closed' && !c.revenueRecognizedAt,
          ).length,
        },
        realized: {
          note: 'Recognized under the configured rule.',
          assignmentFees: sum(realized.map((c) => c.realizedFee ?? 0)),
          deals: realized.length,
          averageFee: realized.length
            ? Math.round(
                sum(realized.map((c) => c.realizedFee ?? 0)) / realized.length,
              )
            : null,
        },
      },
      speed: {
        averageDaysContractToClose: cycleDays.length
          ? round(cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length, 1)
          : null,
        closings: cycleDays.length,
      },
      failures: {
        assignmentsCancelled: assignments.filter(
          (a) => a.status === 'cancelled',
        ).length,
        buyerDefaults: assignments.filter((a) =>
          (a.cancellationReason ?? '').startsWith('buyer_default'),
        ).length,
        closingsCancelled: closings.filter((c) => c.status === 'cancelled')
          .length,
        contractsTerminated: agreements.filter(
          (a) => a.status === 'terminated' || a.status === 'expired',
        ).length,
        campaignsExpired: campaigns.filter((c) => c.status === 'expired')
          .length,
      },
      agents: Array.from(agentStats.entries()).map(([agent, s]) => ({
        agent,
        ...s,
        costUsd: round(s.costUsd, 2),
        approvalRate:
          s.approved + s.rejected > 0
            ? round(s.approved / (s.approved + s.rejected))
            : null,
      })),
    };
  }
}

function sum(ns: number[]) {
  return Math.round(ns.reduce((a, b) => a + b, 0));
}

function round(n: number, places = 2) {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/**
 * The few actions that move a deal, from its state. Exported for tests and
 * so the deal page and the attention list cannot disagree.
 */
export function deriveNextActions(s: {
  stage: string;
  agreement: {
    status: string;
    verifiedAt: Date | null;
    executedDocumentId: string | null;
  } | null;
  eligibility: DispositionEligibility;
  campaigns: Array<{ status: string }>;
  openOffers: Array<{ capturedBy?: string; confirmedAt?: Date | null }>;
  assignment: { status: string; contractId?: string | null } | null;
  closing: {
    status: string;
    readiness: {
      clearToClose: boolean;
      blockers: string[];
      attention: Array<{ level: string; text: string }>;
    };
    feeReceivedAt: Date | null;
  } | null;
  pendingRuns: number;
  pendingDrafts: number;
}): NextAction[] {
  const out: NextAction[] = [];
  if (s.stage === 'closed' || s.stage === 'lost') {
    if (s.stage === 'closed' && s.closing && !s.closing.feeReceivedAt) {
      out.push({
        kind: 'record_fee',
        title: 'Record the assignment fee received',
        detail: 'The fee is projected until the money is recorded.',
        priority: 30,
      });
    }
    return out;
  }
  const a = s.agreement;
  const open = a && ['draft', 'sent', 'executed'].includes(a.status) ? a : null;
  if (!open && ['negotiating', 'under_contract'].includes(s.stage)) {
    out.push({
      kind: 'record_agreement',
      title: 'Record the seller contract',
      detail: 'Enter the terms, or send the agreement for signature.',
      priority: 40,
    });
  } else if (open && open.status !== 'executed') {
    out.push({
      kind: 'execute_agreement',
      title: 'Get the seller contract signed',
      detail: `The agreement is ${open.status}. Record the signed copy when it is back.`,
      priority: 35,
    });
  } else if (open && !open.verifiedAt) {
    out.push({
      kind: 'verify_agreement',
      title: 'Verify the signed contract',
      detail:
        'Check the terms and the assignment clause against the signed copy. Marketing waits for this.',
      priority: 10,
    });
  }
  const failing = s.eligibility.checks.filter(
    (c) =>
      c.status !== 'pass' &&
      c.key !== 'terms_verified' &&
      c.key !== 'agreement_on_file',
  );
  if (open?.status === 'executed') {
    for (const c of failing) {
      out.push(
        c.key === 'jurisdiction_policy' || c.key === 'license'
          ? {
              kind: 'review_policy',
              title: c.label,
              detail: c.fix ?? c.detail,
              priority: c.status === 'fail' ? 5 : 12,
            }
          : {
              kind: 'fix_gate',
              title: c.label,
              detail: c.fix ?? c.detail,
              priority: c.status === 'fail' ? 5 : 12,
            },
      );
    }
  }
  const eligible = s.eligibility.status === 'eligible';
  const hasDraft = s.campaigns.some((c) => c.status === 'draft');
  const hasLive = s.campaigns.some(
    (c) => c.status === 'active' || c.status === 'paused',
  );
  if (eligible && !s.assignment && !hasLive) {
    out.push(
      hasDraft
        ? {
            kind: 'approve_campaign',
            title: 'Approve the buyer campaign',
            detail: 'Review the price, buyers and message, then launch.',
            priority: 15,
          }
        : {
            kind: 'prepare_campaign',
            title: 'Prepare a buyer campaign',
            detail:
              'Halo prices the deal, ranks buyers and drafts the outreach for you to approve.',
            priority: 20,
          },
    );
  }
  const unconfirmed = s.openOffers.filter(
    (o) => o.capturedBy === 'agent' && !o.confirmedAt,
  ).length;
  if (unconfirmed) {
    out.push({
      kind: 'confirm_offer',
      title: `Confirm ${unconfirmed} offer(s) read from email`,
      detail: "Check each amount against the buyer's message.",
      priority: 8,
    });
  }
  if (s.openOffers.length > unconfirmed && !s.assignment) {
    out.push({
      kind: 'decide_offers',
      title: `Decide on ${s.openOffers.length - unconfirmed} offer(s)`,
      detail: 'Each has a recommendation: accept, counter, hold or reject.',
      priority: 6,
    });
  }
  if (s.assignment && s.assignment.status === 'draft') {
    out.push({
      kind: 'send_assignment',
      title: 'Send the assignment for signature',
      detail: 'Use the assignment template from the documents library.',
      priority: 9,
    });
  } else if (s.assignment && s.assignment.status === 'sent') {
    out.push({
      kind: 'record_assignment',
      title: 'Record the executed assignment',
      detail: 'Once both parties sign, record it with the signed copy.',
      priority: 11,
    });
  }
  if (
    s.closing &&
    s.closing.status !== 'closed' &&
    s.closing.status !== 'cancelled'
  ) {
    let urgent = false;
    for (const item of s.closing.readiness.attention) {
      if (item.level === 'overdue' || item.level === 'blocked') {
        urgent = true;
        out.push({
          kind: 'closing_attention',
          title: item.text,
          detail: 'On the Closing tab.',
          priority: item.level === 'blocked' ? 4 : 3,
        });
      } else if (item.level === 'due_soon') {
        urgent = true;
        out.push({
          kind: 'closing_attention',
          title: item.text,
          detail: 'Due within two days, on the Closing tab.',
          priority: 13,
        });
      }
    }
    // Once a buyer is signed, the next closing step is always worth showing.
    if (
      !urgent &&
      s.assignment?.status === 'executed' &&
      !s.closing.readiness.clearToClose &&
      s.closing.readiness.blockers.length > 0
    ) {
      out.push({
        kind: 'closing_attention',
        title: `Next closing step: ${s.closing.readiness.blockers[0]}`,
        detail: `${s.closing.readiness.blockers.length} step(s) before the closing can be confirmed.`,
        priority: 18,
      });
    }
    if (
      s.assignment?.status === 'executed' &&
      s.closing.readiness.clearToClose
    ) {
      out.push({
        kind: 'confirm_closing',
        title: 'Confirm the closing',
        detail: 'Upload the settlement statement and record the fee on it.',
        priority: 7,
      });
    }
  }
  if (s.pendingRuns + s.pendingDrafts > 0) {
    out.push({
      kind: 'approve_drafts',
      title: `${s.pendingRuns + s.pendingDrafts} item(s) awaiting approval`,
      detail: `${s.pendingRuns} agent recommendation(s), ${s.pendingDrafts} message draft(s).`,
      priority: 14,
    });
  }
  return out.sort((x, y) => x.priority - y.priority);
}
