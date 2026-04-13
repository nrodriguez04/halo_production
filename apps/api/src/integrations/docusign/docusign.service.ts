import {
  ForbiddenException,
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneService } from '../../control-plane/control-plane.service';
import * as crypto from 'crypto';
import {
  PolicyViolationError,
  assertPolicy,
} from '@halo/shared';
import { TimelineActorType, TimelineEntityType } from '@prisma/client';
import { TimelineService } from '../../timeline/timeline.service';
import { DealsService } from '../../deals/deals.service';

interface DocuSignEnvelope {
  envelopeId: string;
  status: string;
  statusDateTime: string;
  uri: string;
}

@Injectable()
export class DocuSignService {
  private readonly logger = new Logger(DocuSignService.name);
  private readonly baseUrl = process.env.DOCUSIGN_BASE_URL || 'https://demo.docusign.net';
  private readonly clientId = process.env.DOCUSIGN_CLIENT_ID || '';
  private readonly clientSecret = process.env.DOCUSIGN_CLIENT_SECRET || '';
  private readonly accountId = process.env.DOCUSIGN_ACCOUNT_ID || '';
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private timelineService: TimelineService,
    private dealsService: DealsService,
  ) {}

  async createEnvelope(dealId: string, accountId: string, templateId?: string) {
    // Check control plane
    if (!(await this.controlPlane.isDocuSignEnabled())) {
      throw new BadRequestException('DocuSign is disabled');
    }

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        property: true,
        lead: true,
      },
    });

    if (!deal || deal.accountId !== accountId) {
      throw new BadRequestException(`Deal ${dealId} not found`);
    }

    try {
      const controlPlane = await this.controlPlane.getStatus();
      assertPolicy({
        tenantId: deal.accountId,
        actorId: null,
        actorType: 'user',
        now: new Date(),
        requestedAction: 'docusign.create_envelope',
        channel: 'docusign',
        dealId,
        sideEffectsEnabled: controlPlane.enabled,
      });

      // Get access token
      const token = await this.getAccessToken();

      // Create envelope
      const envelope = await this.createEnvelopeRequest(
        token,
        deal,
        templateId,
      );

      // Store contract record
      const contract = await this.prisma.contract.create({
        data: {
          dealId,
          docusignEnvelopeId: envelope.envelopeId,
          status: 'sent',
        },
      });

      // Update deal stage if needed
      if (deal.stage === 'negotiating') {
        await this.dealsService.updateStage(
          dealId,
          deal.accountId,
          'under_contract',
          null,
          TimelineActorType.system,
        );
      }

      await this.timelineService.appendEvent({
        tenantId: deal.accountId,
        entityType: TimelineEntityType.DEAL,
        entityId: dealId,
        eventType: 'DOCUSIGN_ENVELOPE_CREATED',
        payload: { envelopeId: envelope.envelopeId, contractId: contract.id },
        actorId: null,
        actorType: TimelineActorType.system,
      });

      return {
        contractId: contract.id,
        envelopeId: envelope.envelopeId,
        status: envelope.status,
      };
    } catch (error) {
      if (error instanceof PolicyViolationError) {
        throw new ForbiddenException({
          code: error.code,
          reason: error.reason,
        });
      }
      this.logger.error(`DocuSign envelope creation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getEnvelopeStatus(envelopeId: string) {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(
        `${this.baseUrl}/restapi/v2.1/accounts/${this.accountId}/envelopes/${envelopeId}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`DocuSign API error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Failed to get envelope status: ${error.message}`);
      throw error;
    }
  }

  async downloadPDF(envelopeId: string) {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(
        `${this.baseUrl}/restapi/v2.1/accounts/${this.accountId}/envelopes/${envelopeId}/documents/combined`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/pdf',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`DocuSign API error: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer);
    } catch (error) {
      this.logger.error(`Failed to download PDF: ${error.message}`);
      throw error;
    }
  }

  private async getAccessToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    // Request new token
    const authHeader = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const response = await fetch(`${this.baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials&scope=signature',
    });

    if (!response.ok) {
      throw new Error(`DocuSign auth failed: ${response.status}`);
    }

    const data = await response.json();
    this.accessToken = data.access_token;
    this.tokenExpiry = new Date(Date.now() + (data.expires_in - 60) * 1000); // Refresh 1 min early

    return this.accessToken;
  }

  private async createEnvelopeRequest(
    token: string,
    deal: any,
    templateId?: string,
  ): Promise<DocuSignEnvelope> {
    // Build envelope request
    const envelope = {
      status: 'sent',
      emailSubject: `Purchase Agreement for ${deal.property?.address || 'Property'}`,
      templateId: templateId || undefined,
      templateRoles: templateId
        ? [
            {
              email: deal.lead?.canonicalEmail || 'seller@example.com',
              name: deal.lead?.canonicalOwner || 'Property Owner',
              roleName: 'Seller',
            },
            {
              email: 'buyer@halo.com',
              name: 'Hālo Buyer',
              roleName: 'Buyer',
            },
          ]
        : undefined,
      documents: templateId
        ? undefined
        : [
            {
              documentBase64: this.generateDemoPDF(deal),
              name: 'Purchase Agreement.pdf',
              fileExtension: 'pdf',
              documentId: '1',
            },
          ],
      recipients: templateId
        ? undefined
        : {
            signers: [
              {
                email: deal.lead?.canonicalEmail || 'seller@example.com',
                name: deal.lead?.canonicalOwner || 'Property Owner',
                recipientId: '1',
                routingOrder: '1',
              },
            ],
          },
    };

    const response = await fetch(
      `${this.baseUrl}/restapi/v2.1/accounts/${this.accountId}/envelopes`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(envelope),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DocuSign envelope creation failed: ${response.status} - ${errorText}`);
    }

    return await response.json();
  }

  private generateDemoPDF(deal: any): string {
    // Generate a simple demo PDF in base64
    // In production, use a proper PDF library like pdfkit
    const pdfContent = `%PDF-1.4
1 0 obj
<<
/Type /Catalog
/Pages 2 0 R
>>
endobj
2 0 obj
<<
/Type /Pages
/Kids [3 0 R]
/Count 1
>>
endobj
3 0 obj
<<
/Type /Page
/Parent 2 0 R
/MediaBox [0 0 612 792]
/Contents 4 0 R
/Resources <<
/Font <<
/F1 <<
/Type /Font
/Subtype /Type1
/BaseFont /Helvetica
>>
>>
>>
>>
endobj
4 0 obj
<<
/Length 100
>>
stream
BT
/F1 12 Tf
100 700 Td
(Purchase Agreement) Tj
0 -20 Td
(Property: ${deal.property?.address || 'N/A'}) Tj
0 -20 Td
(ARV: $${deal.arv || 'N/A'}) Tj
0 -20 Td
(Offer: $${deal.offerAmount || 'N/A'}) Tj
ET
endstream
endobj
xref
0 5
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000316 00000 n
trailer
<<
/Size 5
/Root 1 0 R
>>
startxref
416
%%EOF`;

    return Buffer.from(pdfContent).toString('base64');
  }
}


