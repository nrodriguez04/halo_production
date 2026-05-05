import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import {
  LeadStatus,
  LeadTransitionContext,
  isLeadStatus,
  transitionLeadStatus,
} from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { TimelineService } from '../timeline/timeline.service';

// Single owner of all lead status transitions. Replaces the previous
// pattern where statuses were mutated ad-hoc from `LeadsService`,
// worker processors, and OpenClaw skills with no shared validator.
//
// Every transition:
//  - validates against the state-machine table in `@halo/shared`
//  - records a `TimelineEvent` so the UI can render an audit trail
//  - upserts a `LeadEnrichmentJob` row when transitioning into the
//    enrichment-related stages, so cost-governance + worker observers
//    have a single object to attach metadata to
//
// The state machine itself lives in `@halo/shared` so worker processors
// can re-use the validator without an HTTP roundtrip.

const ENRICHMENT_STAGES: Record<LeadStatus, string | null> = {
  new: null,
  enriching: 'enriching',
  enriched: 'completed',
  contacted: null,
  qualified: null,
  disqualified: 'rejected',
};

@Injectable()
export class LeadLifecycleService {
  private readonly logger = new Logger(LeadLifecycleService.name);

  constructor(
    private prisma: PrismaService,
    private timeline: TimelineService,
  ) {}

  /**
   * Apply a status transition for a lead. Returns the updated lead row,
   * or throws BadRequestException if the transition is illegal.
   *
   * Callers that need to perform additional updates in the same
   * transaction can pass `additionalLeadUpdate`; it's merged into the
   * Prisma update payload alongside the new status.
   */
  async transition(params: {
    leadId: string;
    accountId: string;
    next: LeadStatus;
    actorId?: string | null;
    actorType?: 'user' | 'system' | 'worker' | 'webhook';
    reason?: string;
    metadata?: Record<string, unknown>;
    enrichmentJobUpdate?: {
      totalCostUsd?: number;
      rejectedReason?: string;
      metadata?: Record<string, unknown>;
    };
    additionalLeadUpdate?: Record<string, unknown>;
  }) {
    const lead = await this.prisma.lead.findFirst({
      where: { id: params.leadId, accountId: params.accountId },
      select: { id: true, status: true },
    });
    if (!lead) {
      throw new NotFoundException(`Lead ${params.leadId} not found`);
    }

    const ctx: LeadTransitionContext = {
      accountId: params.accountId,
      actorId: params.actorId ?? null,
      actorType: params.actorType ?? 'system',
      reason: params.reason,
    };
    const result = transitionLeadStatus(lead.status, params.next, ctx);
    if (!result.allowed) {
      throw new BadRequestException(
        result.reason ?? `Cannot transition lead ${lead.id}`,
      );
    }

    const ops: Promise<unknown>[] = [];

    ops.push(
      this.prisma.lead.update({
        where: { id: lead.id },
        data: { status: params.next, ...(params.additionalLeadUpdate ?? {}) },
      }),
    );

    const stage = ENRICHMENT_STAGES[params.next];
    if (stage) {
      ops.push(this.upsertEnrichmentJob(lead.id, params.accountId, stage, params));
    }

    ops.push(
      this.timeline.appendEvent({
        tenantId: params.accountId,
        entityType: TimelineEntityType.LEAD,
        entityId: lead.id,
        eventType: `lead.status.${params.next}`,
        actorId: params.actorId ?? null,
        actorType: this.mapActorType(params.actorType),
        payload: {
          from: lead.status,
          to: params.next,
          reason: params.reason ?? null,
          ...(params.metadata ?? {}),
        },
      }),
    );

    await Promise.all(ops);

    return this.prisma.lead.findUnique({ where: { id: lead.id } });
  }

  /**
   * Convenience wrapper that handles the legacy-status case: when an
   * unknown status is in the column, just write `new` without a
   * timeline event so we don't double-log. Used by import paths.
   */
  async ensureNew(leadId: string, accountId: string): Promise<void> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: leadId, accountId },
      select: { status: true },
    });
    if (!lead) return;
    if (lead.status === 'new' || isLeadStatus(lead.status)) return;
    await this.prisma.lead.update({ where: { id: leadId }, data: { status: 'new' } });
  }

  private async upsertEnrichmentJob(
    leadId: string,
    accountId: string,
    stage: string,
    params: {
      enrichmentJobUpdate?: {
        totalCostUsd?: number;
        rejectedReason?: string;
        metadata?: Record<string, unknown>;
      };
    },
  ): Promise<void> {
    const existing = await this.prisma.leadEnrichmentJob.findFirst({
      where: { leadId, completedAt: null },
      orderBy: { startedAt: 'desc' },
    });

    const data = {
      stage,
      ...(stage === 'completed' || stage === 'rejected'
        ? { completedAt: new Date() }
        : {}),
      ...(params.enrichmentJobUpdate?.totalCostUsd !== undefined
        ? { totalCostUsd: params.enrichmentJobUpdate.totalCostUsd }
        : {}),
      ...(params.enrichmentJobUpdate?.rejectedReason
        ? { rejectedReason: params.enrichmentJobUpdate.rejectedReason }
        : {}),
      ...(params.enrichmentJobUpdate?.metadata
        ? { metadata: params.enrichmentJobUpdate.metadata as object }
        : {}),
    };

    if (existing) {
      await this.prisma.leadEnrichmentJob.update({
        where: { id: existing.id },
        data,
      });
      return;
    }

    // Don't create a phantom job for terminal stages — only the
    // enriching path bootstraps a fresh `LeadEnrichmentJob`. If a lead
    // is disqualified before any enrichment ran, there's nothing to
    // record beyond the timeline event the parent `transition` already
    // wrote.
    if (stage !== 'enriching') return;

    await this.prisma.leadEnrichmentJob.create({
      data: {
        accountId,
        leadId,
        ...data,
      },
    });
  }

  private mapActorType(
    t: 'user' | 'system' | 'worker' | 'webhook' | undefined,
  ): TimelineActorType {
    switch (t) {
      case 'user':
        return TimelineActorType.user;
      case 'webhook':
        return TimelineActorType.webhook;
      case 'worker':
      case 'system':
      default:
        return TimelineActorType.system;
    }
  }
}
