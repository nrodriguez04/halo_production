import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import {
  InboundEmailService,
  type InboundAttachment,
  type ParsedInboundEmail,
} from './inbound-email.service';

export const INBOUND_EMAIL_TOKEN_KEY = 'SENDGRID_INBOUND_TOKEN';

/**
 * SendGrid Inbound Parse posts multipart/form-data with `from`, `to`,
 * `subject`, `text`, `html`, `headers`, `envelope` (JSON) and the
 * attachments as file parts. A JSON body with the same field names is
 * accepted too, so another provider or a test can post the same shape.
 */
export function parseInboundPayload(
  body: Record<string, unknown> | undefined,
  files: Array<Express.Multer.File> | undefined,
): ParsedInboundEmail {
  const b = body ?? {};
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  let envelope: ParsedInboundEmail['envelope'] = null;
  const rawEnvelope = b.envelope;
  if (typeof rawEnvelope === 'string' && rawEnvelope.trim()) {
    try {
      envelope = JSON.parse(rawEnvelope) as ParsedInboundEmail['envelope'];
    } catch {
      envelope = null;
    }
  } else if (rawEnvelope && typeof rawEnvelope === 'object') {
    envelope = rawEnvelope as ParsedInboundEmail['envelope'];
  }
  const attachments: InboundAttachment[] = (files ?? [])
    .filter((f) => f?.buffer?.length)
    .map((f) => ({
      originalname: f.originalname || 'attachment',
      mimetype: f.mimetype || 'application/octet-stream',
      size: f.size,
      buffer: f.buffer,
    }));
  return {
    from: str(b.from),
    to: str(b.to),
    subject: str(b.subject),
    text: str(b.text),
    html: str(b.html),
    headers: str(b.headers),
    envelope,
    attachments,
  };
}

@SkipThrottle()
@Controller('webhooks/email')
export class InboundEmailController {
  private readonly logger = new Logger(InboundEmailController.name);

  constructor(
    private readonly inboundEmail: InboundEmailService,
    private readonly secrets: IntegrationSecretsService,
  ) {}

  /**
   * `POST /api/webhooks/email/inbound?token=...` (or header
   * `x-inbound-token`). Inbound Parse cannot sign requests, so the shared
   * token in the URL is the authentication; keep the URL private.
   */
  @Post('inbound')
  @HttpCode(200)
  @UseInterceptors(
    AnyFilesInterceptor({ limits: { fileSize: 10 * 1024 * 1024, files: 10 } }),
  )
  async inbound(
    @Query('token') queryToken: string | undefined,
    @Headers('x-inbound-token') headerToken: string | undefined,
    @Body() body: Record<string, unknown>,
    @UploadedFiles() files: Array<Express.Multer.File> | undefined,
  ) {
    await this.verifyToken(queryToken ?? headerToken);
    const parsed = parseInboundPayload(body, files);
    const result = await this.inboundEmail.handle(parsed);
    this.logger.log(
      `Inbound email ${result.handled}${result.messageId ? ` (${result.messageId})` : ''}`,
    );
    return result;
  }

  private async verifyToken(provided: string | undefined) {
    const expected =
      (await this.secrets.resolve('sendgrid', INBOUND_EMAIL_TOKEN_KEY)) ||
      process.env.INBOUND_EMAIL_TOKEN ||
      null;
    if (!expected) {
      throw new ForbiddenException(
        `Inbound email is not configured - set ${INBOUND_EMAIL_TOKEN_KEY} on the Integrations page`,
      );
    }
    if (!provided) {
      throw new ForbiddenException('Missing inbound email token');
    }
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      this.logger.warn('Rejected inbound email with a wrong token');
      throw new ForbiddenException('Invalid inbound email token');
    }
  }
}
