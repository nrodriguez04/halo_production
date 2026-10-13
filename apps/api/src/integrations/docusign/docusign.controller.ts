import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { TimelineActorType } from '@prisma/client';
import { DocuSignService } from './docusign.service';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../../auth/decorators';
import { CreateEnvelopeSchema, type CreateEnvelopeInput } from './docusign.dto';

@Controller('integrations/docusign')
@UseGuards(AuthGuard)
export class DocuSignController {
  constructor(private readonly docuSignService: DocuSignService) {}

  /** Send library documents for signature to the deal's seller, a buyer, or a named person. */
  @Post('envelopes')
  async createEnvelope(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const input = CreateEnvelopeSchema.parse(body) as CreateEnvelopeInput;
    return this.docuSignService.createEnvelope(
      accountId,
      userId ?? null,
      input,
    );
  }

  /** Reads the envelope's status from DocuSign and records it on the contract. */
  @Get('envelopes/:envelopeId/status')
  async getEnvelopeStatus(
    @Param('envelopeId') envelopeId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.docuSignService.refreshStatus(envelopeId, accountId);
  }

  @Get('envelopes/:envelopeId/pdf')
  async downloadPDF(
    @Param('envelopeId') envelopeId: string,
    @CurrentAccountId() accountId: string,
  ) {
    const pdfBuffer = await this.docuSignService.downloadPDF(
      envelopeId,
      accountId,
    );
    return {
      pdf: pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    };
  }

  /**
   * Pulls the executed copy into the documents library by hand, for when
   * DocuSign Connect is not configured yet and the envelope has completed.
   */
  @Post('contracts/:contractId/store-signed')
  async storeSigned(
    @Param('contractId') contractId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const stored = await this.docuSignService.storeSignedCopy(
      contractId,
      accountId,
    );
    const completed = await this.docuSignService.onEnvelopeCompleted(
      contractId,
      accountId,
      { actorId: userId ?? null, actorType: TimelineActorType.user },
    );
    return { ...stored, movedToMarketing: completed.movedToMarketing };
  }
}
