import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { DocuSignService } from './docusign.service';

@SkipThrottle()
@Controller('webhooks/docusign')
export class DocuSignController {
  private readonly logger = new Logger(DocuSignController.name);

  constructor(private readonly docuSignService: DocuSignService) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Headers('x-docusign-signature-1') signature?: string,
  ) {
    this.verifyDocuSignHmac(body, signature);
    return this.docuSignService.handleWebhook(body);
  }

  /**
   * DocuSign Connect signs the JSON body using HMAC-SHA256
   * with the Connect secret from the integration settings.
   */
  private verifyDocuSignHmac(
    body: any,
    signature: string | undefined,
  ) {
    const secret = process.env.DOCUSIGN_CONNECT_SECRET;
    if (!secret) {
      throw new ForbiddenException(
        'Webhook verification not configured — DOCUSIGN_CONNECT_SECRET is required',
      );
    }

    if (!signature) {
      throw new ForbiddenException(
        'Missing x-docusign-signature-1 header',
      );
    }

    const payload = JSON.stringify(body);
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('base64');

    const sigBuf = Buffer.from(signature, 'base64');
    const expBuf = Buffer.from(expected, 'base64');

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new ForbiddenException('Invalid DocuSign HMAC signature');
    }
  }
}
