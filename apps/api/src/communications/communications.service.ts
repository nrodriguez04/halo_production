import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { ComplianceService } from '../compliance/compliance.service';
import {
  PolicyViolationError,
  assertPolicy,
  MessageCreate,
} from '@halo/shared';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class CommunicationsService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private compliance: ComplianceService,
    private controlPlaneService: ControlPlaneService,
  ) {}

  async create(data: MessageCreate) {
    // Check control plane
    const controlPlane = await this.getControlPlane(data.accountId);
    const channelEnabled =
      data.channel === 'sms'
        ? controlPlane.smsEnabled
        : controlPlane.emailEnabled;

    if (!controlPlane.enabled || !channelEnabled) {
      throw new BadRequestException('Communications are currently disabled');
    }

    const compliance = await this.getComplianceFacts(data);
    const localHour =
      typeof compliance.localHour === 'number'
        ? compliance.localHour
        : undefined;

    try {
      assertPolicy({
        tenantId: data.accountId,
        actorId: null,
        actorType: 'user',
        now: new Date(),
        requestedAction:
          data.direction === 'outbound'
            ? `comms.send_${data.channel}`
            : 'comms.receive',
        channel: data.channel === 'sms' ? 'sms' : 'email',
        leadId: data.leadId || undefined,
        hasConsent: compliance.hasConsent,
        consentSource: compliance.consentSource,
        isDnc: compliance.isDnc,
        timezone: compliance.timezone,
        localHour,
        sideEffectsEnabled: controlPlane.enabled,
        messagingEnabled: channelEnabled,
      });
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      throw error;
    }

    // Create message in pending_approval status
    const message = await this.prisma.message.create({
      data: {
        ...data,
        status: 'pending_approval',
      },
    });

    await this.timelineService.appendEvent({
      tenantId: data.accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: message.id,
      eventType: 'MESSAGE_CREATED_PENDING_APPROVAL',
      payload: { channel: message.channel, direction: message.direction },
      actorId: null,
      actorType: TimelineActorType.user,
    });

    return message;
  }

  async findAll(
    accountId: string,
    status?: string,
    pagination?: { skip?: number; take?: number },
  ) {
    const where: any = { accountId };
    if (status) {
      where.status = status;
    }

    const skip = pagination?.skip ?? 0;
    const take = pagination?.take ?? 50;

    return this.prisma.message.findMany({
      where,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, accountId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id, accountId },
    });

    if (!message) {
      throw new NotFoundException(`Message with ID ${id} not found`);
    }

    return message;
  }

  async approve(
    id: string,
    accountId: string,
    userId: string,
    queueService?: any,
  ) {
    const message = await this.findOne(id, accountId);

    if (message.status !== 'pending_approval') {
      throw new BadRequestException('Message is not pending approval');
    }

    // A provider receipt means this message was already dispatched once.
    // Whatever put it back into pending_approval, approving it again would
    // send a second copy.
    const priorReceipt = (message.metadata as Record<string, unknown> | null)
      ?.twilioMessageSid;
    if (typeof priorReceipt === 'string' && priorReceipt.length > 0) {
      throw new BadRequestException(
        'Message was already dispatched to the provider',
      );
    }

    const controlPlane = await this.getControlPlane(accountId);
    const compliance = await this.getComplianceFacts(message as any);
    try {
      assertPolicy({
        tenantId: accountId,
        actorId: userId,
        actorType: 'user',
        now: new Date(),
        requestedAction:
          message.channel === 'sms' ? 'comms.send_sms' : 'comms.send_email',
        channel: message.channel === 'sms' ? 'sms' : 'email',
        leadId: message.leadId || undefined,
        messageId: message.id,
        hasConsent: compliance.hasConsent,
        consentSource: compliance.consentSource,
        isDnc: compliance.isDnc,
        timezone: compliance.timezone,
        localHour: compliance.localHour,
        sideEffectsEnabled: controlPlane.enabled,
        messagingEnabled:
          message.channel === 'sms'
            ? controlPlane.smsEnabled
            : controlPlane.emailEnabled,
      });
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      throw error;
    }

    // Update status
    const updated = await this.prisma.message.update({
      where: { id },
      data: {
        status: 'approved',
        approvedAt: new Date(),
        approvedBy: userId,
      },
    });

    // Queue job for sending (if queue service provided)
    if (queueService) {
      await queueService.enqueueCommunication(id);
    }

    await this.timelineService.appendEvent({
      tenantId: updated.accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: updated.id,
      eventType: 'MESSAGE_APPROVED',
      payload: { approvedBy: userId },
      actorId: userId,
      actorType: TimelineActorType.user,
    });

    return updated;
  }

  async reject(id: string, accountId: string, userId: string, reason?: string) {
    const existing = await this.findOne(id, accountId);
    const rejected = await this.prisma.message.update({
      where: { id },
      data: {
        status: 'draft',
        metadata: {
          ...((existing.metadata as any) || {}),
          rejectionReason: reason,
          rejectedBy: userId,
          rejectedAt: new Date().toISOString(),
        },
      },
    });

    await this.timelineService.appendEvent({
      tenantId: rejected.accountId,
      entityType: TimelineEntityType.MESSAGE,
      entityId: rejected.id,
      eventType: 'MESSAGE_REJECTED',
      payload: { reason: reason || null },
      actorId: userId,
      actorType: TimelineActorType.user,
    });

    return rejected;
  }

  /**
   * Delegates to ControlPlaneService: switches are per-tenant and a missing
   * row is provisioned at documented defaults. The previous inline
   * `cp || { enabled: true, ... }` fallback meant an unscoped lookup that
   * returned nothing was silently treated as "everything enabled".
   */
  private async getControlPlane(accountId: string) {
    return this.controlPlaneService.getStatus(accountId);
  }

  /**
   * Delegates to ComplianceService so the facts evaluated here match exactly
   * those re-evaluated at send time. The previous inline version also looked
   * DNC up by phone alone, ignoring accountId, so one tenant suppressing a
   * number suppressed it for everyone.
   */
  private async getComplianceFacts(data: MessageCreate | any) {
    return this.compliance.getFacts({
      accountId: data.accountId,
      channel: data.channel,
      phone: data.metadata?.phone ?? data.metadata?.to,
      email: data.metadata?.email,
      leadId: data.leadId,
    });
  }
}
