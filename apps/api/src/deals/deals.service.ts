import {
  Injectable,
  BadRequestException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  DealCreate,
  DealStage,
  DealUpdate,
  transitionDealStage,
} from '@halo/shared';
import { TimelineService } from '../timeline/timeline.service';
import { AutomationService } from '../automation/automation.service';
import { LeadPiiService } from '../leads/lead-pii.service';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private automationService: AutomationService,
    private pii: LeadPiiService,
  ) {}

  /** Deal rows carry the lead relation; shape its contact fields for the caller. */
  private presentDeal<T extends { lead?: Record<string, unknown> | null }>(
    deal: T,
    revealPii: boolean,
  ) {
    if (!deal.lead) return deal;
    return { ...deal, lead: this.pii.present(deal.lead as any, revealPii) };
  }

  async create(
    data: DealCreate,
    actorId: string | null = null,
    opts: { revealPii?: boolean } = {},
  ) {
    if (data.leadId) {
      const lead = await this.prisma.lead.findFirst({
        where: {
          id: data.leadId,
          accountId: data.accountId,
        },
        select: { id: true },
      });

      if (!lead) {
        throw new NotFoundException(`Lead with ID ${data.leadId} not found`);
      }
    }

    if (data.propertyId) {
      const property = await this.prisma.property.findFirst({
        where: {
          id: data.propertyId,
          accountId: data.accountId,
        },
        select: { id: true },
      });

      if (!property) {
        throw new NotFoundException(
          `Property with ID ${data.propertyId} not found`,
        );
      }
    }

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

    return this.presentDeal(deal, opts.revealPii ?? false);
  }

  async findAll(
    accountId: string,
    stage?: string,
    pagination?: { skip?: number; take?: number },
    revealPii = false,
  ) {
    const where: any = { accountId };
    if (stage) {
      where.stage = stage;
    }

    const skip = pagination?.skip ?? 0;
    const take = pagination?.take ?? 50;

    const deals = await this.prisma.deal.findMany({
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
    return deals.map((d) => this.presentDeal(d, revealPii));
  }

  async findOne(
    id: string,
    accountId: string,
    opts: { revealPii?: boolean } = {},
  ) {
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

    return this.presentDeal(deal, opts.revealPii ?? false);
  }

  async update(
    id: string,
    accountId: string,
    data: DealUpdate,
    opts: { revealPii?: boolean } = {},
  ) {
    if (data.accountId !== undefined) {
      throw new BadRequestException(
        'accountId cannot be updated via the generic deal update endpoint',
      );
    }

    if (data.stage !== undefined) {
      throw new BadRequestException(
        'Deal stage must be updated via the dedicated stage transition endpoint',
      );
    }

    const deal = await this.prisma.deal.findFirst({
      where: { id, accountId },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${id} not found`);
    }

    if (data.leadId !== undefined) {
      const lead = await this.prisma.lead.findFirst({
        where: { id: data.leadId, accountId },
      });

      if (!lead) {
        throw new BadRequestException(
          'leadId must reference a lead in the authenticated account',
        );
      }
    }

    if (data.propertyId !== undefined) {
      const property = await this.prisma.property.findFirst({
        where: { id: data.propertyId, accountId },
      });

      if (!property) {
        throw new BadRequestException(
          'propertyId must reference a property in the authenticated account',
        );
      }
    }

    const updated = await this.prisma.deal.update({
      where: { id: deal.id },
      data,
      include: {
        lead: true,
        property: true,
        contracts: true,
      },
    });
    return this.presentDeal(updated, opts.revealPii ?? false);
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

    const transition = transitionDealStage(deal.stage as DealStage, stage, {
      tenantId: accountId,
      actorId,
      actorType,
    });

    if (!transition.allowed) {
      throw new BadRequestException(
        transition.reason || 'Invalid stage transition',
      );
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
      this.logger.warn(
        `Stage-change attribution failed for deal ${id}: ${err}`,
      );
    }

    return updated;
  }
}
