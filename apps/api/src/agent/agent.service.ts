import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CommunicationsService } from '../communications/communications.service';
import { TimelineService } from '../timeline/timeline.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';

@Injectable()
export class AgentService {
  constructor(
    private prisma: PrismaService,
    private communicationsService: CommunicationsService,
    private timelineService: TimelineService,
    private controlPlaneService: ControlPlaneService,
  ) {}

  async getDealSummary(dealId: string, accountId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        lead: true,
        property: true,
        underwritingResult: true,
        economics: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const recentMessages = await this.prisma.message.findMany({
      where: { dealId, accountId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const recentTimeline = await this.timelineService.getEntityTimeline(
      accountId,
      TimelineEntityType.DEAL,
      dealId,
      10,
    );

    return {
      deal: {
        id: deal.id,
        stage: deal.stage,
        arv: deal.arv,
        repairEstimate: deal.repairEstimate,
        mao: deal.mao,
        offerAmount: deal.offerAmount,
        createdAt: deal.createdAt,
        updatedAt: deal.updatedAt,
      },
      lead: deal.lead
        ? {
            id: deal.lead.id,
            status: deal.lead.status,
            owner: deal.lead.canonicalOwner,
            phone: deal.lead.canonicalPhone,
            email: deal.lead.canonicalEmail,
          }
        : null,
      property: deal.property
        ? {
            id: deal.property.id,
            address: deal.property.address,
            city: deal.property.city,
            state: deal.property.state,
            zip: deal.property.zip,
            estimatedValue: deal.property.estimatedValue,
          }
        : null,
      underwriting: deal.underwritingResult
        ? {
            arv: deal.underwritingResult.arv,
            repairEstimate: deal.underwritingResult.repairEstimate,
            mao: deal.underwritingResult.mao,
            confidence: deal.underwritingResult.confidence,
          }
        : null,
      economics: deal.economics || null,
      recentCommunications: recentMessages.map((m) => ({
        id: m.id,
        channel: m.channel,
        direction: m.direction,
        status: m.status,
        sentAt: m.sentAt,
        createdAt: m.createdAt,
        contentPreview: m.content.substring(0, 200),
      })),
      recentTimeline: recentTimeline.map((e) => ({
        eventType: e.eventType,
        createdAt: e.createdAt,
        payload: e.payloadJson,
      })),
    };
  }

  async getDealContext(dealId: string, accountId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        lead: { include: { consents: true } },
        property: true,
        contracts: true,
        underwritingResult: true,
        marketingMaterials: true,
        economics: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const allMessages = await this.prisma.message.findMany({
      where: { dealId, accountId },
      orderBy: { createdAt: 'desc' },
    });

    const timeline = await this.timelineService.getEntityTimeline(
      accountId,
      TimelineEntityType.DEAL,
      dealId,
      50,
    );

    const automationRuns = await this.prisma.automationRun.findMany({
      where: { tenantId: accountId, entityType: 'deal', entityId: dealId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const controlPlane = await this.controlPlaneService.getStatus();

    const quietHours = await this.prisma.quietHours.findFirst({
      where: { accountId },
    });

    return {
      deal,
      communications: allMessages,
      timeline,
      automationRuns,
      controlPlane: {
        enabled: controlPlane.enabled,
        smsEnabled: controlPlane.smsEnabled,
        emailEnabled: controlPlane.emailEnabled,
      },
      quietHours: quietHours
        ? {
            enabled: quietHours.enabled,
            timezone: quietHours.timezone,
            startHour: quietHours.startHour,
            endHour: quietHours.endHour,
          }
        : null,
    };
  }

  async suggestNextActions(
    dealId: string,
    accountId: string,
    input?: { agentName?: string; context?: Record<string, any> },
  ) {
    const summary = await this.getDealSummary(dealId, accountId);
    const actions: Array<{
      action: string;
      reason: string;
      priority: 'high' | 'medium' | 'low';
      endpoint?: string;
    }> = [];

    const { deal, recentCommunications, lead } = summary;

    const hasRecentOutbound = recentCommunications.some(
      (m) =>
        m.direction === 'outbound' &&
        m.createdAt > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    );

    const hasRecentInbound = recentCommunications.some(
      (m) =>
        m.direction === 'inbound' &&
        m.createdAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    );

    if (deal.stage === 'new' && !hasRecentOutbound) {
      actions.push({
        action: 'draft-seller-sms',
        reason: 'New deal with no recent outreach',
        priority: 'high',
        endpoint: `POST /api/agent/deals/${dealId}/draft-seller-sms`,
      });
    }

    if (hasRecentInbound && !hasRecentOutbound) {
      actions.push({
        action: 'draft-seller-email',
        reason: 'Unanswered inbound message',
        priority: 'high',
        endpoint: `POST /api/agent/deals/${dealId}/draft-seller-email`,
      });
    }

    if (
      deal.stage === 'contacted' &&
      !hasRecentOutbound &&
      !hasRecentInbound
    ) {
      actions.push({
        action: 'draft-seller-sms',
        reason: 'Follow-up needed — no recent activity',
        priority: 'medium',
        endpoint: `POST /api/agent/deals/${dealId}/draft-seller-sms`,
      });
    }

    if (deal.stage === 'marketing') {
      actions.push({
        action: 'draft-buyer-email',
        reason: 'Deal is in marketing stage — notify buyers',
        priority: 'medium',
        endpoint: `POST /api/agent/deals/${dealId}/draft-buyer-email`,
      });
    }

    if (deal.stage === 'under_contract' || deal.stage === 'assigned') {
      actions.push({
        action: 'log-note',
        reason: 'Check deal progress and log status update',
        priority: 'low',
        endpoint: `POST /api/agent/deals/${dealId}/log-agent-note`,
      });
    }

    return { dealId, actions, generatedAt: new Date().toISOString() };
  }

  async draftMessage(
    dealId: string,
    accountId: string,
    channel: 'sms' | 'email',
    recipientType: 'seller' | 'buyer',
    input: {
      content: string;
      subject?: string;
      agentName?: string;
      workflowName?: string;
      automationRunId?: string;
      metadata?: Record<string, any>;
    },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: { lead: true },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    let automationRunId = input.automationRunId;
    if (!automationRunId) {
      const run = await this.prisma.automationRun.create({
        data: {
          tenantId: accountId,
          source: 'openclaw',
          agentName: input.agentName || 'unknown',
          workflowName:
            input.workflowName ||
            `draft-${recipientType}-${channel}`,
          entityType: 'deal',
          entityId: dealId,
          status: 'RUNNING',
          startedAt: new Date(),
          triggerType: 'API',
          inputJson: {
            channel,
            recipientType,
            content: input.content.substring(0, 500),
          },
          approvalRequired: true,
        },
      });
      automationRunId = run.id;
    }

    const message = await this.prisma.message.create({
      data: {
        accountId,
        dealId,
        leadId: recipientType === 'seller' ? deal.leadId : null,
        channel,
        direction: 'outbound',
        status: 'draft',
        content: input.content,
        source: 'openclaw',
        agentName: input.agentName,
        automationRunId,
        metadata: {
          recipientType,
          subject: input.subject,
          ...(input.metadata || {}),
        },
      },
    });

    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: dealId,
      eventType: 'AGENT_DRAFT_CREATED',
      payload: {
        messageId: message.id,
        channel,
        recipientType,
        source: 'openclaw',
        agentName: input.agentName,
        automationRunId,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });

    await this.prisma.automationRun.update({
      where: { id: automationRunId },
      data: {
        status: 'AWAITING_APPROVAL',
        outputJson: { messageId: message.id },
      },
    });

    return {
      message,
      automationRunId,
      nextStep: 'Message created as draft. Submit to approval queue to send.',
    };
  }

  async getPendingApprovals(accountId: string) {
    return this.prisma.message.findMany({
      where: {
        accountId,
        status: 'pending_approval',
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async requestSend(
    messageId: string,
    accountId: string,
    input?: { agentName?: string; automationRunId?: string },
  ) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, accountId },
    });

    if (!message) {
      throw new NotFoundException(`Message ${messageId} not found`);
    }

    if (message.status !== 'draft') {
      throw new BadRequestException(
        `Message status is "${message.status}", expected "draft". Only drafts can be submitted for approval.`,
      );
    }

    const controlPlane = await this.controlPlaneService.getStatus();

    if (!controlPlane.enabled) {
      throw new ForbiddenException('Control plane is disabled');
    }

    const channelEnabled =
      message.channel === 'sms'
        ? controlPlane.smsEnabled
        : controlPlane.emailEnabled;

    if (!channelEnabled) {
      throw new ForbiddenException(
        `Channel ${message.channel} is currently disabled`,
      );
    }

    const updated = await this.prisma.message.update({
      where: { id: messageId },
      data: { status: 'pending_approval' },
    });

    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: messageId,
      eventType: 'AGENT_REQUESTED_SEND',
      payload: {
        source: 'openclaw',
        agentName: input?.agentName,
        automationRunId: input?.automationRunId || message.automationRunId,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });

    if (message.automationRunId) {
      await this.prisma.automationRun.update({
        where: { id: message.automationRunId },
        data: { status: 'AWAITING_APPROVAL' },
      });
    }

    return {
      message: updated,
      status: 'pending_approval',
      info: 'Message submitted for human approval. It will be sent after approval.',
    };
  }

  async logAgentNote(
    dealId: string,
    accountId: string,
    input: { text: string; agentName?: string; automationRunId?: string },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
    });

    if (!deal) {
      throw new NotFoundException(`Deal ${dealId} not found`);
    }

    const event = await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: dealId,
      eventType: 'AGENT_NOTE',
      payload: {
        text: input.text,
        source: 'openclaw',
        agentName: input.agentName,
        automationRunId: input.automationRunId,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });

    return { event, logged: true };
  }

  async classifyInbound(
    dealId: string,
    accountId: string,
    input: { messageId: string; agentName?: string },
  ) {
    const message = await this.prisma.message.findFirst({
      where: { id: input.messageId, accountId, dealId },
    });

    if (!message) {
      throw new NotFoundException(`Message ${input.messageId} not found`);
    }

    if (message.direction !== 'inbound') {
      throw new BadRequestException('Only inbound messages can be classified');
    }

    const content = message.content.toLowerCase();
    let classification = 'neutral';
    let sentiment = 'neutral';

    if (
      content.includes('interested') ||
      content.includes('yes') ||
      content.includes('tell me more')
    ) {
      classification = 'positive_interest';
      sentiment = 'positive';
    } else if (
      content.includes('stop') ||
      content.includes('no') ||
      content.includes('not interested') ||
      content.includes('remove')
    ) {
      classification = 'opt_out';
      sentiment = 'negative';
    } else if (
      content.includes('price') ||
      content.includes('offer') ||
      content.includes('how much')
    ) {
      classification = 'pricing_inquiry';
      sentiment = 'positive';
    } else if (
      content.includes('when') ||
      content.includes('schedule') ||
      content.includes('meet')
    ) {
      classification = 'scheduling_request';
      sentiment = 'positive';
    }

    await this.timelineService.appendEvent({
      tenantId: accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: input.messageId,
      eventType: 'AGENT_CLASSIFIED_INBOUND',
      payload: {
        classification,
        sentiment,
        source: 'openclaw',
        agentName: input.agentName,
      },
      actorId: null,
      actorType: TimelineActorType.system,
    });

    return {
      messageId: input.messageId,
      classification,
      sentiment,
      suggestedActions:
        classification === 'opt_out'
          ? ['honor-opt-out', 'add-to-dnc']
          : classification === 'positive_interest'
            ? ['draft-follow-up', 'schedule-call']
            : classification === 'pricing_inquiry'
              ? ['draft-offer-details']
              : ['review-manually'],
    };
  }

  async proposeFollowUp(
    dealId: string,
    accountId: string,
    input: {
      agentName?: string;
      channel?: string;
      context?: Record<string, any>;
    },
  ) {
    const summary = await this.getDealSummary(dealId, accountId);
    const channel = input.channel || 'sms';

    let suggestedContent = '';
    const { deal, lead, property } = summary;

    const ownerName = lead?.owner?.split(' ')[0] || 'there';
    const address = property?.address || 'your property';

    if (deal.stage === 'new' || deal.stage === 'contacted') {
      suggestedContent =
        channel === 'sms'
          ? `Hi ${ownerName}, I wanted to follow up regarding ${address}. We're still interested in making a competitive cash offer. Would you have a few minutes to chat this week?`
          : `Hello ${ownerName},\n\nI hope this message finds you well. I'm reaching out to follow up on our interest in ${address}. We remain prepared to present a strong cash offer.\n\nWould you be available for a brief call to discuss the details?\n\nBest regards`;
    } else if (deal.stage === 'negotiating') {
      suggestedContent =
        channel === 'sms'
          ? `Hi ${ownerName}, just following up on our conversation about ${address}. Happy to answer any questions or adjust the terms. Let me know what works for you.`
          : `Hello ${ownerName},\n\nThank you for your time discussing ${address}. I wanted to follow up and see if you have any additional questions about our offer.\n\nWe're flexible on terms and would love to find an arrangement that works for both of us.\n\nBest regards`;
    } else {
      suggestedContent = `Hi ${ownerName}, checking in on the progress with ${address}. Please let me know if there's anything I can help with.`;
    }

    return {
      dealId,
      suggestedChannel: channel,
      suggestedContent,
      recipientType: 'seller',
      instructions:
        'Use the draft endpoint to create this as a Hālo draft. Do not send directly.',
    };
  }
}
