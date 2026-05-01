import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { TimelineService } from '../timeline/timeline.service';
import {
  AutomationRunStatus,
  AutomationTriggerType,
  TimelineActorType,
  TimelineEntityType,
} from '@prisma/client';

@Injectable()
export class AutomationService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private controlPlane: ControlPlaneService,
  ) {}

  async createRun(input: {
    tenantId: string;
    source?: string;
    agentName?: string;
    workflowName?: string;
    entityType?: string;
    entityId?: string;
    triggerType?: AutomationTriggerType;
    inputJson?: any;
    approvalRequired?: boolean;
    modelProvider?: string;
    modelName?: string;
    promptVersion?: string;
    parentRunId?: string;
  }) {
    const isEnabled = await this.controlPlane.isEnabled();
    if (!isEnabled) {
      throw new Error('System is disabled — automation runs cannot be created');
    }

    const run = await this.prisma.automationRun.create({
      data: {
        tenantId: input.tenantId,
        source: input.source || 'openclaw',
        agentName: input.agentName,
        workflowName: input.workflowName,
        entityType: input.entityType,
        entityId: input.entityId,
        status: AutomationRunStatus.QUEUED,
        triggerType: input.triggerType || AutomationTriggerType.API,
        inputJson: input.inputJson,
        approvalRequired: input.approvalRequired || false,
        modelProvider: input.modelProvider,
        modelName: input.modelName,
        promptVersion: input.promptVersion,
        parentRunId: input.parentRunId,
      },
    });

    if (input.entityType && input.entityId) {
      await this.timelineService.appendEvent({
        tenantId: input.tenantId,
        entityType: this.mapEntityType(input.entityType),
        entityId: input.entityId,
        eventType: 'AUTOMATION_RUN_CREATED',
        payload: {
          automationRunId: run.id,
          source: run.source,
          agentName: run.agentName,
          workflowName: run.workflowName,
        },
        actorId: null,
        actorType: TimelineActorType.system,
      });
    }

    return run;
  }

  async startRun(runId: string, tenantId: string) {
    return this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.RUNNING,
        startedAt: new Date(),
      },
    });
  }

  async completeRun(
    runId: string,
    tenantId: string,
    output?: {
      outputJson?: any;
      decisionJson?: any;
      estimatedValueUsd?: number;
      realizedValueUsd?: number;
      aiCostUsd?: number;
      messageCostUsd?: number;
      toolCostUsd?: number;
    },
  ) {
    const run = await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.COMPLETED,
        completedAt: new Date(),
        outputJson: output?.outputJson,
        decisionJson: output?.decisionJson,
        estimatedValueUsd: output?.estimatedValueUsd,
        realizedValueUsd: output?.realizedValueUsd,
        aiCostUsd: output?.aiCostUsd,
        messageCostUsd: output?.messageCostUsd,
        toolCostUsd: output?.toolCostUsd,
      },
    });

    if (run.entityType && run.entityId) {
      await this.timelineService.appendEvent({
        tenantId,
        entityType: this.mapEntityType(run.entityType),
        entityId: run.entityId,
        eventType: 'AUTOMATION_RUN_COMPLETED',
        payload: {
          automationRunId: run.id,
          workflowName: run.workflowName,
        },
        actorId: null,
        actorType: TimelineActorType.system,
      });
    }

    return run;
  }

  async failRun(runId: string, tenantId: string, errorJson?: any) {
    const run = await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.FAILED,
        completedAt: new Date(),
        errorJson,
      },
    });

    if (run.entityType && run.entityId) {
      await this.timelineService.appendEvent({
        tenantId,
        entityType: this.mapEntityType(run.entityType),
        entityId: run.entityId,
        eventType: 'AUTOMATION_RUN_FAILED',
        payload: {
          automationRunId: run.id,
          error: errorJson,
        },
        actorId: null,
        actorType: TimelineActorType.system,
      });
    }

    return run;
  }

  async cancelRun(runId: string, tenantId: string) {
    return this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: AutomationRunStatus.CANCELLED,
        completedAt: new Date(),
      },
    });
  }

  async approveRun(runId: string, tenantId: string, userId: string) {
    return this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        approvedByUserId: userId,
        approvedAt: new Date(),
      },
    });
  }

  async getRun(runId: string, tenantId: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: { id: runId, tenantId },
      include: { messages: true, childRuns: true },
    });

    if (!run) {
      throw new NotFoundException(`AutomationRun ${runId} not found`);
    }

    return run;
  }

  async listRuns(
    tenantId: string,
    filters?: {
      status?: AutomationRunStatus;
      source?: string;
      workflowName?: string;
      entityType?: string;
      entityId?: string;
      skip?: number;
      take?: number;
    },
  ) {
    const where: any = { tenantId };
    if (filters?.status) where.status = filters.status;
    if (filters?.source) where.source = filters.source;
    if (filters?.workflowName) where.workflowName = filters.workflowName;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;

    return this.prisma.automationRun.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: filters?.skip,
      take: filters?.take || 50,
      include: { messages: { select: { id: true, status: true, channel: true } } },
    });
  }

  /**
   * Attribution: link an inbound reply back to the most recent automation run
   * on the same deal/lead within the attribution window (default 7 days).
   */
  async attributeReply(
    messageId: string,
    tenantId: string,
    opts?: { windowDays?: number },
  ) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId },
    });

    if (!message || message.direction !== 'inbound') return null;

    const windowMs = (opts?.windowDays || 7) * 24 * 60 * 60 * 1000;
    const windowStart = new Date(
      message.createdAt.getTime() - windowMs,
    );

    const priorOutbound = await this.prisma.message.findFirst({
      where: {
        accountId: tenantId,
        dealId: message.dealId,
        leadId: message.leadId,
        direction: 'outbound',
        automationRunId: { not: null },
        createdAt: { gte: windowStart, lt: message.createdAt },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (priorOutbound?.automationRunId) {
      await this.prisma.message.update({
        where: { id: messageId },
        data: {
          metadata: {
            ...((message.metadata as any) || {}),
            attributedToRunId: priorOutbound.automationRunId,
            attributionMethod: 'nearest_prior_outbound',
          },
        },
      });

      return {
        attributed: true,
        automationRunId: priorOutbound.automationRunId,
        method: 'nearest_prior_outbound',
      };
    }

    return { attributed: false };
  }

  /**
   * Attribution: when a deal stage changes, optionally attribute to the
   * most recent relevant automation run.
   */
  async attributeStageChange(
    dealId: string,
    tenantId: string,
    newStage: string,
    opts?: { windowDays?: number },
  ) {
    const windowMs = (opts?.windowDays || 14) * 24 * 60 * 60 * 1000;
    const windowStart = new Date(Date.now() - windowMs);

    const recentRun = await this.prisma.automationRun.findFirst({
      where: {
        tenantId,
        entityType: 'deal',
        entityId: dealId,
        status: { in: ['COMPLETED', 'AWAITING_APPROVAL'] },
        createdAt: { gte: windowStart },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentRun) {
      await this.timelineService.appendEvent({
        tenantId,
        entityType: TimelineEntityType.DEAL,
        entityId: dealId,
        eventType: 'DEAL_STAGE_ATTRIBUTED',
        payload: {
          newStage,
          automationRunId: recentRun.id,
          attributionMethod: 'nearest_recent_run',
        },
        actorId: null,
        actorType: TimelineActorType.system,
      });

      return {
        attributed: true,
        automationRunId: recentRun.id,
        method: 'nearest_recent_run',
      };
    }

    return { attributed: false };
  }

  private mapEntityType(type: string): TimelineEntityType {
    const map: Record<string, TimelineEntityType> = {
      deal: TimelineEntityType.DEAL,
      lead: TimelineEntityType.LEAD,
      message: TimelineEntityType.MESSAGE,
      property: TimelineEntityType.PROPERTY,
      job: TimelineEntityType.JOB,
    };
    return map[type.toLowerCase()] || TimelineEntityType.DEAL;
  }
}
