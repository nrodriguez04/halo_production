import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  DealCreate,
  DealStage,
  DealUpdate,
  transitionDealStage,
} from '@halo/shared';
import { TimelineService } from '../timeline/timeline.service';
import { AutomationService } from '../automation/automation.service';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private automationService: AutomationService,
  ) {}

  async create(data: DealCreate, actorId: string | null = null) {
    const deal = await this.prisma.deal.create({
      data,
      include: {
        lead: true,
        property: true,
        contracts: true,
      },
    });

    await this.timelineService.appendEvent({
      tenantId: deal.accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: deal.id,
      eventType: 'DEAL_CREATED',
      payload: { stage: deal.stage },
      actorId,
      actorType: actorId ? TimelineActorType.user : TimelineActorType.system,
    });

    return deal;
  }

  async findAll(
    accountId: string,
    stage?: string,
    pagination?: { skip?: number; take?: number },
  ) {
    const where: any = { accountId };
    if (stage) {
      where.stage = stage;
    }

    const skip = pagination?.skip ?? 0;
    const take = pagination?.take ?? 50;

    return this.prisma.deal.findMany({
      where,
      skip,
      take,
      include: {
        lead: true,
        property: true,
        contracts: true,
        underwritingResult: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, accountId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, accountId },
      include: {
        lead: true,
        property: true,
        contracts: true,
        underwritingResult: true,
        marketingMaterials: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }

    return deal;
  }

  async update(id: string, accountId: string, data: DealUpdate) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, accountId },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }

    return this.prisma.deal.update({
      where: { id: deal.id },
      data,
      include: {
        lead: true,
        property: true,
        contracts: true,
      },
    });
  }

  async updateStage(
    id: string,
    accountId: string,
    stage: DealStage,
    actorId: string | null,
    actorType: TimelineActorType = TimelineActorType.user,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, accountId },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }

    const transition = transitionDealStage(
      deal.stage as DealStage,
      stage,
      {
        tenantId: accountId,
        actorId,
        actorType,
      },
    );

    if (!transition.allowed) {
      throw new BadRequestException(transition.reason || 'Invalid stage transition');
    }

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data: { stage },
    });

    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: id,
      eventType: 'DEAL_STAGE_CHANGED',
      payload: {
        from: deal.stage,
        to: stage,
      },
      actorId,
      actorType,
    });

    try {
      await this.automationService.attributeStageChange(id, accountId, stage);
    } catch (err) {
      this.logger.warn(`Stage-change attribution failed for deal ${id}: ${err}`);
    }

    return updated;
  }
}

