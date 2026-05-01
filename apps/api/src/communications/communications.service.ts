import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  PolicyViolationError,
  assertPolicy,
  MessageCreate,
} from '@halo/shared';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import * as complianceUtils from '@halo/shared';
import { TimelineService } from '../timeline/timeline.service';

@Injectable()
export class CommunicationsService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
  ) {}

  async create(data: MessageCreate) {
    // Check control plane
    const controlPlane = await this.getControlPlane();
    const channelEnabled = data.channel === 'sms' 
      ? controlPlane.smsEnabled 
      : controlPlane.emailEnabled;

    if (!controlPlane.enabled || !channelEnabled) {
      throw new BadRequestException('Communications are currently disabled');
    }

    const compliance = await this.getComplianceFacts(data);
    const localHour =
      typeof compliance.localHour === 'number' ? compliance.localHour : undefined;

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

  async approve(id: string, accountId: string, userId: string, queueService?: any) {
    const message = await this.findOne(id, accountId);
    
    if (message.status !== 'pending_approval') {
      throw new BadRequestException('Message is not pending approval');
    }

    const controlPlane = await this.getControlPlane();
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

  private async getControlPlane() {
    const cp = await this.prisma.controlPlane.findFirst();
    return cp || {
      enabled: true,
      smsEnabled: true,
      emailEnabled: true,
      docusignEnabled: true,
      externalDataEnabled: true,
    };
  }

  private async getComplianceFacts(data: MessageCreate | any) {
    const facts: {
      isDnc: boolean;
      hasConsent: boolean;
      consentSource?: string;
      timezone?: string;
      localHour?: number;
    } = {
      isDnc: false,
      hasConsent: true,
    };

    // Check DNC
    if (data.metadata?.phone) {
      const normalizedPhone = complianceUtils.normalizePhoneNumber(data.metadata.phone);
      const dnc = await this.prisma.dNCList.findFirst({
        where: {
          phone: normalizedPhone,
        },
      });

      facts.isDnc = !!dnc;
    }

    // Check consent
    if (data.leadId) {
      const consent = await this.prisma.consent.findFirst({
        where: {
          leadId: data.leadId,
          channel: data.channel,
          revokedAt: null,
        },
        orderBy: { grantedAt: 'desc' },
      });

      facts.hasConsent = !!consent;
      facts.consentSource = consent?.source;
    }

    // Check quiet hours
    const quietHours = await this.prisma.quietHours.findFirst({
      where: { accountId: data.accountId },
    });

    if (quietHours?.enabled) {
      const config = {
        startHour: quietHours.startHour,
        endHour: quietHours.endHour,
        timezone: quietHours.timezone,
        enabled: true,
      };
      facts.timezone = quietHours.timezone;
      facts.localHour = this.getLocalHour(quietHours.timezone);
      // keep existing util invocation as guard for timezone/config validity
      complianceUtils.isWithinQuietHours(config);
    }

    return facts;
  }

  private getLocalHour(timezone: string): number | undefined {
    try {
      const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(new Date());
      return parseInt(formatted, 10);
    } catch {
      return undefined;
    }
  }
}

