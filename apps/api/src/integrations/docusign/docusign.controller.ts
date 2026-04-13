import { Controller, Get, Post, Param, UseGuards, Query } from '@nestjs/common';
import { DocuSignService } from './docusign.service';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAccountId } from '../../auth/decorators';

@Controller('integrations/docusign')
@UseGuards(AuthGuard)
export class DocuSignController {
  constructor(private readonly docuSignService: DocuSignService) {}

  @Post('envelopes')
  async createEnvelope(
    @Query('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @Query('templateId') templateId?: string,
  ) {
    return this.docuSignService.createEnvelope(dealId, accountId, templateId);
  }

  @Get('envelopes/:envelopeId/status')
  async getEnvelopeStatus(@Param('envelopeId') envelopeId: string) {
    return this.docuSignService.getEnvelopeStatus(envelopeId);
  }

  @Get('envelopes/:envelopeId/pdf')
  async downloadPDF(@Param('envelopeId') envelopeId: string) {
    const pdfBuffer = await this.docuSignService.downloadPDF(envelopeId);
    return {
      pdf: pdfBuffer.toString('base64'),
      contentType: 'application/pdf',
    };
  }
}


