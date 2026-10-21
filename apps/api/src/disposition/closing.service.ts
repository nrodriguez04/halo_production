import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TimelineActorType } from '@prisma/client';
import {
  closingReadiness,
  isRevenueRealized,
  milestoneDueDate,
  milestoneTemplate,
  type DealStructure,
  type IssueSeverity,
  type MilestoneStatus,
  type RevenueRecognitionRule,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';
import { DealsService } from '../deals/deals.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { assertDealDocument } from './document-refs';
import { dealEvent } from './timeline-events';

type ClosingWithChildren = Prisma.ClosingFileGetPayload<{
  include: { milestones: true; issues: true };
}>;

/**
 * Title and closing coordination (docs/contract-flipping.md s6). A closing
 * file opens when the seller contract is executed: title work starts then,
 * not when a buyer is found. Milestones come from the shared template for
 * the deal's structure; their due dates follow the file's own dates.
 *
 * Nothing here moves money. Confirming a closing records what the
 * settlement statement says; the fee becomes revenue only under the
 * tenant's recognition rule.
 */
@Injectable()
export class ClosingService {
  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
    private deals: DealsService,
    private controlPlane: ControlPlaneService,
  ) {}

  /** The deal's file, opened with the template's milestones if it has none. */
  async ensureFile(
    accountId: string,
    dealId: string,
    actorId: string | null,
    structure: DealStructure = 'assignment',
  ) {
    const existing = await this.prisma.closingFile.findUnique({
      where: { dealId },
    });
    if (existing) {
      if (existing.accountId !== accountId) {
        throw new NotFoundException(`Deal ${dealId} not found`);
      }
      return existing;
    }
    const openedAt = new Date();
    const template = milestoneTemplate(structure);
    const file = await this.prisma.closingFile.create({
      data: {
        accountId,
        dealId,
        structure,
        openedAt,
        milestones: {
          create: template.map((t, i) => ({
            accountId,
            key: t.key,
            label: t.label,
            blocking: t.blocking,
            sortOrder: i,
            dueAt: milestoneDueDate(t, {
              fileOpenedAt: openedAt,
              assignmentExecutedAt: null,
              closingDate: null,
            }),
          })),
        },
      },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_FILE_OPENED',
      {
        closingFileId: file.id,
        structure,
      },
      actorId,
    );
    return file;
  }

  async loadFile(
    accountId: string,
    dealId: string,
  ): Promise<ClosingWithChildren> {
    const file = await this.prisma.closingFile.findFirst({
      where: { accountId, dealId },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        issues: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!file) {
      throw new NotFoundException(
        'This deal has no closing file yet. One opens when the seller contract is executed.',
      );
    }
    return file;
  }

  /** The file with its readiness: blockers, overdue and imminent items. */
  async get(accountId: string, dealId: string, now = new Date()) {
    const file = await this.prisma.closingFile.findFirst({
      where: { accountId, dealId },
      include: {
        milestones: { orderBy: { sortOrder: 'asc' } },
        issues: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!file) return null;
    const [agreement, assignment] = await Promise.all([
      this.prisma.purchaseAgreement.findFirst({
        where: { accountId, dealId },
        orderBy: { createdAt: 'desc' },
        select: { closingDeadline: true },
      }),
      this.prisma.assignmentAgreement.findFirst({
        where: { accountId, dealId, status: { not: 'cancelled' } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
    return {
      ...file,
      assignment,
      readiness: this.readiness(file, agreement?.closingDeadline ?? null, now),
    };
  }

  readiness(
    file: ClosingWithChildren,
    contractDeadline: Date | null,
    now = new Date(),
  ) {
    return closingReadiness({
      now,
      milestones: file.milestones.map((m) => ({
        key: m.key,
        label: m.label,
        status: m.status as MilestoneStatus,
        blocking: m.blocking,
        dueAt: m.dueAt,
      })),
      issues: file.issues.map((i) => ({
        kind: i.kind,
        severity: i.severity as IssueSeverity,
        description: i.description,
        open: i.status === 'open',
      })),
      contractDeadline:
        file.status === 'closed' || file.status === 'cancelled'
          ? null
          : contractDeadline,
      scheduledClosingAt: file.scheduledClosingAt,
    });
  }

  async update(
    accountId: string,
    dealId: string,
    userId: string,
    patch: {
      structure?: DealStructure;
      titleStatus?: string;
      closingAgentCompany?: string | null;
      closingAgentOfficer?: string | null;
      closingAgentEmail?: string | null;
      closingAgentPhone?: string | null;
      fileNumber?: string | null;
      scheduledClosingAt?: Date | null;
    },
  ) {
    const file = await this.loadFile(accountId, dealId);
    this.assertOpen(file);
    const { structure, ...fields } = patch;
    await this.prisma.closingFile.update({
      where: { id: file.id },
      data: fields,
    });
    if (structure && structure !== file.structure) {
      await this.changeStructure(file, structure);
    }
    if (patch.scheduledClosingAt !== undefined) {
      await this.redateMilestones(accountId, dealId);
    }
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_FILE_UPDATED',
      {
        fields: Object.keys(patch),
        ...(structure && structure !== file.structure
          ? { structure: { from: file.structure, to: structure } }
          : {}),
      },
      userId,
    );
    await this.refreshStatus(accountId, dealId);
    return this.get(accountId, dealId);
  }

  /**
   * Switching between an assignment and a double close swaps the
   * structure-specific milestones that are still pending; anything already
   * done stays on the record.
   */
  private async changeStructure(
    file: ClosingWithChildren,
    structure: DealStructure,
  ) {
    const template = milestoneTemplate(structure);
    const keys = new Set(template.map((t) => t.key));
    const stale = file.milestones.filter(
      (m) => !keys.has(m.key) && m.status === 'pending',
    );
    if (stale.length) {
      await this.prisma.closingMilestone.deleteMany({
        where: { id: { in: stale.map((m) => m.id) } },
      });
    }
    const have = new Set(file.milestones.map((m) => m.key));
    const missing = template
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !have.has(t.key));
    if (missing.length) {
      await this.prisma.closingMilestone.createMany({
        data: missing.map(({ t, i }) => ({
          accountId: file.accountId,
          closingFileId: file.id,
          key: t.key,
          label: t.label,
          blocking: t.blocking,
          sortOrder: i,
        })),
      });
    }
    // Keep the template's order for the ones that remain.
    for (const [i, t] of template.entries()) {
      await this.prisma.closingMilestone.updateMany({
        where: { closingFileId: file.id, key: t.key },
        data: { sortOrder: i, label: t.label },
      });
    }
    await this.prisma.closingFile.update({
      where: { id: file.id },
      data: { structure },
    });
  }

  /** Recompute due dates of pending milestones from the file's dates. */
  async redateMilestones(accountId: string, dealId: string) {
    const file = await this.loadFile(accountId, dealId);
    const assignment = await this.prisma.assignmentAgreement.findFirst({
      where: { accountId, dealId, status: 'executed' },
      orderBy: { executedAt: 'desc' },
      select: { executedAt: true },
    });
    const template = milestoneTemplate(file.structure as DealStructure);
    for (const m of file.milestones) {
      if (m.status !== 'pending') continue;
      const t = template.find((x) => x.key === m.key);
      if (!t) continue;
      const dueAt = milestoneDueDate(t, {
        fileOpenedAt: file.openedAt,
        assignmentExecutedAt: assignment?.executedAt ?? null,
        closingDate: file.scheduledClosingAt,
      });
      if ((dueAt?.getTime() ?? null) !== (m.dueAt?.getTime() ?? null)) {
        await this.prisma.closingMilestone.update({
          where: { id: m.id },
          data: { dueAt },
        });
      }
    }
  }

  async setMilestone(
    accountId: string,
    dealId: string,
    key: string,
    actorId: string | null,
    input: {
      status: MilestoneStatus;
      note?: string;
      evidenceDocumentId?: string;
    },
  ) {
    const file = await this.loadFile(accountId, dealId);
    this.assertOpen(file);
    const milestone = file.milestones.find((m) => m.key === key);
    if (!milestone) {
      throw new NotFoundException(
        `Milestone ${key} is not on this closing file`,
      );
    }
    if (input.evidenceDocumentId) {
      const deal = await this.dealRef(accountId, dealId);
      await assertDealDocument(
        this.prisma,
        accountId,
        input.evidenceDocumentId,
        deal,
        'Milestone evidence',
      );
    }
    const done = input.status !== 'pending';
    await this.prisma.closingMilestone.update({
      where: { id: milestone.id },
      data: {
        status: input.status,
        note: input.note ?? milestone.note,
        evidenceDocumentId:
          input.evidenceDocumentId ?? milestone.evidenceDocumentId,
        completedAt: done ? new Date() : null,
        completedBy: done ? actorId : null,
      },
    });
    await this.applyMilestoneSideEffects(
      accountId,
      dealId,
      file,
      key,
      input.status,
    );
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_MILESTONE_UPDATED',
      {
        key,
        label: milestone.label,
        from: milestone.status,
        to: input.status,
        note: input.note ?? null,
      },
      actorId,
    );
    await this.refreshStatus(accountId, dealId);
    return this.get(accountId, dealId);
  }

  /** Milestones that record a fact elsewhere keep that record in step. */
  private async applyMilestoneSideEffects(
    accountId: string,
    dealId: string,
    file: ClosingWithChildren,
    key: string,
    status: MilestoneStatus,
  ) {
    const now = new Date();
    if (status !== 'done') return;
    if (key === 'title_opened' && file.titleStatus === 'not_opened') {
      await this.prisma.closingFile.update({
        where: { id: file.id },
        data: { titleStatus: 'opened' },
      });
    } else if (
      key === 'title_commitment' &&
      ['not_opened', 'opened'].includes(file.titleStatus)
    ) {
      await this.prisma.closingFile.update({
        where: { id: file.id },
        data: { titleStatus: 'commitment_received' },
      });
    } else if (key === 'title_clear') {
      const openTitle = file.issues.some(
        (i) =>
          i.kind === 'title' &&
          i.status === 'open' &&
          i.severity === 'blocking',
      );
      if (openTitle) {
        throw new BadRequestException(
          'Title cannot be marked clear while a blocking title issue is open. Resolve the issue first.',
        );
      }
      await this.prisma.closingFile.update({
        where: { id: file.id },
        data: { titleStatus: 'clear' },
      });
    } else if (key === 'seller_emd_deposited') {
      await this.prisma.purchaseAgreement.updateMany({
        where: {
          accountId,
          dealId,
          status: 'executed',
          earnestMoneyDepositedAt: null,
        },
        data: { earnestMoneyDepositedAt: now },
      });
    } else if (key === 'buyer_emd_received') {
      await this.prisma.assignmentAgreement.updateMany({
        where: {
          accountId,
          dealId,
          status: { in: ['draft', 'sent', 'executed'] },
          buyerDepositReceivedAt: null,
        },
        data: { buyerDepositReceivedAt: now },
      });
    }
  }

  async raiseIssue(
    accountId: string,
    dealId: string,
    actorId: string | null,
    input: { kind: string; severity: IssueSeverity; description: string },
  ) {
    const file = await this.loadFile(accountId, dealId);
    this.assertOpen(file);
    const issue = await this.prisma.closingIssue.create({
      data: {
        accountId,
        dealId,
        closingFileId: file.id,
        kind: input.kind,
        severity: input.severity,
        description: input.description,
        raisedBy: actorId,
      },
    });
    if (input.kind === 'title') {
      await this.prisma.closingFile.update({
        where: { id: file.id },
        data: { titleStatus: 'issues' },
      });
      // A blocking title issue reopens a milestone marked clear.
      if (input.severity === 'blocking') {
        await this.prisma.closingMilestone.updateMany({
          where: { closingFileId: file.id, key: 'title_clear', status: 'done' },
          data: { status: 'pending', completedAt: null, completedBy: null },
        });
      }
    }
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_ISSUE_RAISED',
      {
        issueId: issue.id,
        kind: issue.kind,
        severity: issue.severity,
        description: issue.description,
      },
      actorId,
    );
    await this.refreshStatus(accountId, dealId);
    return issue;
  }

  async resolveIssue(
    accountId: string,
    issueId: string,
    userId: string,
    resolution: string,
  ) {
    const issue = await this.prisma.closingIssue.findFirst({
      where: { id: issueId, accountId },
    });
    if (!issue) throw new NotFoundException(`Issue ${issueId} not found`);
    if (issue.status !== 'open') {
      throw new ConflictException('This issue is already resolved');
    }
    const updated = await this.prisma.closingIssue.update({
      where: { id: issue.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: userId,
        resolution,
      },
    });
    if (issue.kind === 'title') {
      const stillOpen = await this.prisma.closingIssue.count({
        where: {
          closingFileId: issue.closingFileId,
          kind: 'title',
          status: 'open',
        },
      });
      if (stillOpen === 0) {
        await this.prisma.closingFile.update({
          where: { id: issue.closingFileId },
          data: { titleStatus: 'commitment_received' },
        });
      }
    }
    await dealEvent(
      this.timeline,
      accountId,
      issue.dealId,
      'CLOSING_ISSUE_RESOLVED',
      {
        issueId: issue.id,
        kind: issue.kind,
        resolution,
      },
      userId,
    );
    await this.refreshStatus(accountId, issue.dealId);
    return updated;
  }

  /**
   * A person confirms the closing from the settlement statement. Refused
   * while any blocking milestone is pending or a blocking issue is open:
   * a file is closed only when it actually closed.
   */
  async confirmClosing(
    accountId: string,
    dealId: string,
    userId: string,
    input: {
      closedAt: Date;
      settlementDocumentId: string;
      feeOnStatement: number;
      feeReceivedAt?: Date;
    },
  ) {
    const file = await this.loadFile(accountId, dealId);
    this.assertOpen(file);
    const deal = await this.dealRef(accountId, dealId);
    await assertDealDocument(
      this.prisma,
      accountId,
      input.settlementDocumentId,
      deal,
      'Settlement statement',
    );
    const assignment = await this.prisma.assignmentAgreement.findFirst({
      where: { accountId, dealId, status: 'executed' },
      orderBy: { executedAt: 'desc' },
    });
    if (!assignment) {
      throw new BadRequestException(
        'There is no executed assignment (or resale contract) for this deal, so there is nothing to close.',
      );
    }
    const agreement = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
      select: { closingDeadline: true, purchasePrice: true },
    });
    // The contract deadline is in the past by the time some closings are
    // recorded; what matters is that the closing date itself met it.
    const readiness = this.readiness(file, null);
    if (!readiness.clearToClose) {
      throw new ConflictException({
        message: 'The closing file is not clear to close.',
        blockers: readiness.blockers,
      });
    }
    if (
      agreement?.closingDeadline &&
      input.closedAt.getTime() >
        agreement.closingDeadline.getTime() + 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'The closing date is after the seller contract deadline. Record the signed extension on the agreement first.',
      );
    }

    const rule = await this.recognitionRule(accountId);
    const realized = isRevenueRealized(rule, {
      closedAt: input.closedAt,
      feeReceivedAt: input.feeReceivedAt ?? null,
      realizedFee: input.feeOnStatement,
    });
    await this.prisma.closingFile.update({
      where: { id: file.id },
      data: {
        status: 'closed',
        closedAt: input.closedAt,
        closedBy: userId,
        settlementDocumentId: input.settlementDocumentId,
        expectedFee: assignment.assignmentFee,
        realizedFee: input.feeOnStatement,
        feeReceivedAt: input.feeReceivedAt ?? null,
        feeRecordedBy: input.feeReceivedAt ? userId : null,
        revenueRecognizedAt: realized ? new Date() : null,
      },
    });
    await this.recordEconomics(accountId, dealId, {
      fee: input.feeOnStatement,
      realized,
      at: input.feeReceivedAt ?? input.closedAt,
      contractPrice: agreement?.purchasePrice ?? null,
      assignmentPrice: assignment.assignmentPrice,
    });

    // The buyer now has a verified purchase with us, which the ranking
    // counts as both a local purchase and a completed closing.
    const property = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: {
        property: {
          select: { address: true, city: true, state: true, zip: true },
        },
      },
    });
    await this.prisma.buyerTransaction.create({
      data: {
        accountId,
        buyerId: assignment.buyerId,
        dealId,
        address: property?.property?.address ?? null,
        city: property?.property?.city ?? null,
        state: property?.property?.state ?? null,
        zip: property?.property?.zip ?? null,
        price: assignment.assignmentPrice,
        closedAt: input.closedAt,
        source: 'halo_closing',
        sourceRef: `closing:${file.id}`,
        createdBy: userId,
      },
    });
    await this.prisma.dispositionCampaign.updateMany({
      where: {
        accountId,
        dealId,
        status: { in: ['active', 'paused', 'draft'] },
      },
      data: { status: 'completed', endedAt: new Date(), endedReason: 'closed' },
    });
    await this.prisma.dealShareLink.updateMany({
      where: { accountId, dealId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: 'system:closed' },
    });

    await this.deals.updateStage(
      dealId,
      accountId,
      'closed',
      userId,
      TimelineActorType.user,
    );
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_CONFIRMED',
      {
        closingFileId: file.id,
        closedAt: input.closedAt.toISOString(),
        feeOnStatement: input.feeOnStatement,
        expectedFee: assignment.assignmentFee,
        revenue: realized ? 'realized' : 'projected until the fee is received',
        rule,
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  /** The fee arrived: under on_funds_received this is when it becomes revenue. */
  async recordFeeReceived(
    accountId: string,
    dealId: string,
    userId: string,
    input: { amount: number; receivedAt: Date },
  ) {
    const file = await this.loadFile(accountId, dealId);
    if (file.status !== 'closed') {
      throw new BadRequestException(
        'Record the fee once the closing is confirmed; until then it is a projection.',
      );
    }
    const rule = await this.recognitionRule(accountId);
    const realized = isRevenueRealized(rule, {
      closedAt: file.closedAt,
      feeReceivedAt: input.receivedAt,
      realizedFee: input.amount,
    });
    await this.prisma.closingFile.update({
      where: { id: file.id },
      data: {
        realizedFee: input.amount,
        feeReceivedAt: input.receivedAt,
        feeRecordedBy: userId,
        revenueRecognizedAt: realized
          ? (file.revenueRecognizedAt ?? new Date())
          : null,
      },
    });
    await this.recordEconomics(accountId, dealId, {
      fee: input.amount,
      realized,
      at: input.receivedAt,
      contractPrice: null,
      assignmentPrice: null,
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'ASSIGNMENT_FEE_RECEIVED',
      {
        amount: input.amount,
        receivedAt: input.receivedAt.toISOString(),
        expected: file.expectedFee,
        difference:
          file.expectedFee != null ? input.amount - file.expectedFee : null,
      },
      userId,
    );
    return this.get(accountId, dealId);
  }

  /** The deal will not close at all (seller contract gone, deal dead). */
  async cancelClosing(
    accountId: string,
    dealId: string,
    userId: string,
    input: { reason: string; markDealLost: boolean },
  ) {
    const file = await this.loadFile(accountId, dealId);
    this.assertOpen(file);
    await this.prisma.closingFile.update({
      where: { id: file.id },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: input.reason,
      },
    });
    await this.prisma.assignmentAgreement.updateMany({
      where: {
        accountId,
        dealId,
        status: { in: ['draft', 'sent', 'executed'] },
      },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: userId,
        cancellationReason: `closing cancelled: ${input.reason}`,
      },
    });
    await this.prisma.dispositionCampaign.updateMany({
      where: {
        accountId,
        dealId,
        status: { in: ['active', 'paused', 'draft'] },
      },
      data: {
        status: 'cancelled',
        endedAt: new Date(),
        endedReason: 'closing cancelled',
      },
    });
    await this.prisma.dealShareLink.updateMany({
      where: { accountId, dealId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: userId },
    });
    await this.prisma.dealEconomics.updateMany({
      where: { dealId, tenantId: accountId, revenueStatus: 'projected' },
      data: { revenueStatus: 'lost' },
    });
    await dealEvent(
      this.timeline,
      accountId,
      dealId,
      'CLOSING_CANCELLED',
      {
        reason: input.reason,
      },
      userId,
    );
    if (input.markDealLost) {
      await this.deals.updateStage(dealId, accountId, 'lost', userId);
    }
    return this.get(accountId, dealId);
  }

  /** open <-> clear_to_close, from the readiness of the file. */
  async refreshStatus(accountId: string, dealId: string) {
    const file = await this.loadFile(accountId, dealId);
    if (file.status === 'closed' || file.status === 'cancelled') return;
    const agreement = await this.prisma.purchaseAgreement.findFirst({
      where: { accountId, dealId },
      orderBy: { createdAt: 'desc' },
      select: { closingDeadline: true },
    });
    const hasExecuted = await this.prisma.assignmentAgreement.count({
      where: { accountId, dealId, status: 'executed' },
    });
    const ready =
      hasExecuted > 0 &&
      this.readiness(file, agreement?.closingDeadline ?? null).clearToClose;
    const next = ready ? 'clear_to_close' : 'open';
    if (next !== file.status) {
      await this.prisma.closingFile.update({
        where: { id: file.id },
        data: { status: next },
      });
      await dealEvent(
        this.timeline,
        accountId,
        dealId,
        'CLOSING_STATUS_CHANGED',
        {
          from: file.status,
          to: next,
        },
        null,
      );
    }
  }

  private async recordEconomics(
    accountId: string,
    dealId: string,
    input: {
      fee: number;
      realized: boolean;
      at: Date;
      contractPrice: number | null;
      assignmentPrice: number | null;
    },
  ) {
    const data = {
      assignmentFee: input.fee,
      ...(input.contractPrice != null
        ? { contractPrice: input.contractPrice }
        : {}),
      ...(input.assignmentPrice != null
        ? { assignmentPrice: input.assignmentPrice }
        : {}),
      revenueStatus: input.realized ? 'realized' : 'projected',
      realizedFee: input.realized ? input.fee : null,
      realizedAt: input.realized ? input.at : null,
    };
    const existing = await this.prisma.dealEconomics.findUnique({
      where: { dealId },
      select: { id: true, tenantId: true },
    });
    if (existing && existing.tenantId !== accountId) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }
    if (existing) {
      await this.prisma.dealEconomics.update({ where: { dealId }, data });
    } else {
      await this.prisma.dealEconomics.create({
        data: { dealId, tenantId: accountId, ...data },
      });
    }
  }

  private async recognitionRule(
    accountId: string,
  ): Promise<RevenueRecognitionRule> {
    const cp = await this.controlPlane.getStatus(accountId);
    return cp.revenueRecognition === 'on_closing_confirmed'
      ? 'on_closing_confirmed'
      : 'on_funds_received';
  }

  private async dealRef(accountId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      select: { id: true, leadId: true },
    });
    if (!deal) throw new NotFoundException(`Deal ${dealId} not found`);
    return deal;
  }

  private assertOpen(file: { status: string }) {
    if (file.status === 'closed' || file.status === 'cancelled') {
      throw new ConflictException(`The closing file is ${file.status}`);
    }
  }
}
