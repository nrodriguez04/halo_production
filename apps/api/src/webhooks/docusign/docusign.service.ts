import { Injectable, Logger } from '@nestjs/common';
import { Prisma, TimelineActorType, TimelineEntityType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { TimelineService } from '../../timeline/timeline.service';
import { DealsService } from '../../deals/deals.service';
import { DocuSignService as DocuSignIntegrationService } from '../../integrations/docusign/docusign.service';

/** DocuSign Connect event -> contract status. Unlisted events only log. */
const EVENT_STATUS: Record<string, string> = {
  'envelope-sent': 'sent',
  'envelope-delivered': 'delivered',
  'envelope-completed': 'completed',
  'envelope-signed': 'completed',
  'envelope-declined': 'declined',
  'recipient-declined': 'declined',
  'envelope-voided': 'voided',
};

/**
 * DocuSign Connect (account-level webhook, HMAC-verified by the controller).
 * Status lands on the contract; a completed envelope is pulled into the
 * documents library as the executed copy and moves the deal on.
 */
@Injectable()
export class DocuSignService {
  private readonly logger = new Logger(DocuSignService.name);

  constructor(
    private prisma: PrismaService,
    private timelineService: TimelineService,
    private dealsService: DealsService,
    private docusign: DocuSignIntegrationService,
  ) {}

  async handleWebhook(body: any) {
    const envelopeId: string | undefined = body?.data?.envelopeId;
    const event: string = String(body?.event ?? '');
    if (!envelopeId) return { message: 'No envelope ID' };

    const contract = await this.prisma.contract.findUnique({
      where: { docusignEnvelopeId: envelopeId },
      include: { deal: true },
    });
    if (!contract) return { message: 'Contract not found' };

    const status = EVENT_STATUS[event];
    const metadata = (contract.metadata ?? {}) as Record<string, unknown>;
    if (status) {
      await this.prisma.contract.update({
        where: { id: contract.id },
        data: {
          status,
          metadata: { ...metadata, lastEvent: event } as Prisma.InputJsonObject,
        },
      });
    }

    let signedDocumentId: string | null = null;
    if (status === 'completed') {
      const done = await this.docusign.onEnvelopeCompleted(
        contract.id,
        contract.deal.accountId,
        { actorId: null, actorType: TimelineActorType.webhook },
      );
      signedDocumentId = done.signedDocumentId;
    }

    await this.timelineService.appendEvent({
      tenantId: contract.deal.accountId,
      entityType: TimelineEntityType.DEAL,
      entityId: contract.dealId,
      eventType: `DOCUSIGN_${event || 'EVENT'}`
        .toUpperCase()
        .replace(/-/g, '_'),
      payload: { envelopeId, event, status: status ?? null, signedDocumentId },
      actorId: null,
      actorType: TimelineActorType.webhook,
    });

    return { message: 'Webhook processed', status: status ?? contract.status };
  }
}
