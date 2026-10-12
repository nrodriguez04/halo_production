import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  ForbiddenException,
  Logger,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { DocuSignService } from './docusign.service';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { DOCUSIGN_KEYS } from '../../integrations/docusign/docusign.service';

@SkipThrottle()
@Controller('webhooks/docusign')
export class DocuSignController {
  private readonly logger = new Logger(DocuSignController.name);

  constructor(
    private readonly docuSignService: DocuSignService,
    private readonly secrets: IntegrationSecretsService,
  ) {}

  @Post()
  @HttpCode(200)
  async handleWebhook(
    @Body() body: any,
    @Req() req: Request,
    @Headers('x-docusign-signature-1') signature?: string,
  ) {
    await this.verifyDocuSignHmac(req, body, signature);
    return this.docuSignService.handleWebhook(body);
  }

  /**
   * DocuSign Connect signs the raw JSON body with HMAC-SHA256 using the
   * Connect secret saved on the Integrations page (or DOCUSIGN_CONNECT_SECRET).
   */
  private async verifyDocuSignHmac(
    req: Request,
    body: any,
    signature: string | undefined,
  ) {
    const secret = await this.secrets.resolve(
      'docusign',
      DOCUSIGN_KEYS.connectSecret,
    );
    if (!secret) {
      throw new ForbiddenException(
        'Webhook verification not configured — DOCUSIGN_CONNECT_SECRET is required',
      );
    }

    if (!signature) {
      throw new ForbiddenException('Missing x-docusign-signature-1 header');
    }

    // Prefer the raw bytes captured in main.ts; JSON.stringify(body) does not
    // round-trip to the exact payload DocuSign signed.
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const payload = rawBody ?? Buffer.from(JSON.stringify(body), 'utf8');
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('base64');

    const sigBuf = Buffer.from(signature, 'base64');
    const expBuf = Buffer.from(expected, 'base64');

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      this.logger.warn(
        'Rejected DocuSign webhook with an invalid HMAC signature',
      );
      throw new ForbiddenException('Invalid DocuSign HMAC signature');
    }
  }
}
