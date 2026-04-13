import { Controller, Post, Body, Headers, HttpCode } from '@nestjs/common';
import { DocuSignService } from './docusign.service';

@Controller('webhooks/docusign')
export class DocuSignController {
  constructor(private readonly docuSignService: DocuSignService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-docusign-signature-1') signature?: string,
  ) {
    // Verify HMAC signature in production
    return this.docuSignService.handleWebhook(body);
  }
}

