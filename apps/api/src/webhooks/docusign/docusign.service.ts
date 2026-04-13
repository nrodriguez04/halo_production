import { Injectable } from '@nestjs/common';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { DealsService } from '../../deals/deals.service';

@Injectable()
export class DocuSignService {
  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private dealsService: DealsService,
  ) {}

  async handleWebhook(body: any) {
    // DocuSign Connect webhook format
    const envelopeId = body.data?.envelopeId;
    const event = body.event;

    if (!envelopeId) {
      return { message: 'No envelope ID' };
    }

    // Find contract by envelope ID
    const contract = await this.prisma.contract.findUnique({
      where: { docusignEnvelopeId: envelopeId },
      include: { deal: true },
    });

    if (!contract) {
      return { message: 'Contract not found' };
    }

    // Handle different events
    if (event === 'envelope-completed' || event === 'envelope-signed') {
      // Update contract status
      await this.prisma.contract.update({
        where: { id: contract.id },
        data: {
          status: 'signed',
        },
      });

      // Update deal stage if needed
      if (contract.deal.stage === 'under_contract') {
        await this.dealsService.updateStage(
          contract.dealId,
          contract.deal.accountId,
          'marketing',
          null,
          TimelineActorType.webhook,
        );
      }

      // Store PDF URL if provided
      if (body.data?.pdfUrl) {
        await this.prisma.contract.update({
          where: { id: contract.id },
          data: { pdfUrl: body.data.pdfUrl },
        });
      }
    } else if (event === 'envelope-declined') {
      await this.prisma.contract.update({
        where: { id: contract.id },
        data: { status: 'declined' },
      });
    }

    await this.timelineService.appendEvent({
      tenantId: contract.deal.accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: contract.dealId,
      eventType: `DOCUSIGN_${event || 'EVENT'}`.toUpperCase(),
      payload: { envelopeId, event },
      actorId: null,
      actorType: TimelineActorType.webhook,
    });

    return { message: 'Webhook processed' };
  }
}

