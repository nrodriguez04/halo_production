import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request } from 'express';
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { ProviderEventsService } from './provider-events.service';
import {
  resendEvent,
  sendgridEvents,
  verifySendGridSignature,
  verifySvixSignature,
} from './provider-events';

/**
 * Delivery, bounce, complaint and unsubscribe events from the email
 * providers (docs/communications.md s5). Each request must carry the
 * provider's signature; without a configured key the route refuses
 * rather than trusting an unsigned body.
 */
@SkipThrottle()
@Controller('webhooks/email')
export class ProviderEventsController {
  // One line per delivery, counts only: whether the provider's webhook is
  // reaching Hålo and being accepted is otherwise invisible.
  private readonly logger = new Logger(ProviderEventsController.name);

  constructor(
    private events: ProviderEventsService,
    private secrets: IntegrationSecretsService,
  ) {}

  @Post('sendgrid-events')
  @HttpCode(200)
  async sendgrid(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('x-twilio-email-event-webhook-signature') signature?: string,
    @Headers('x-twilio-email-event-webhook-timestamp') timestamp?: string,
  ) {
    const key = await this.secrets.resolve(
      'sendgrid',
      'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY',
    );
    if (!key)
      throw new ServiceUnavailableException(
        'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY is not configured.',
      );
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (
      !raw ||
      !signature ||
      !timestamp ||
      !verifySendGridSignature(key, signature, timestamp, raw)
    ) {
      this.logger.warn(
        `SendGrid events refused: ${signature ? 'signature did not verify' : 'unsigned'}`,
      );
      throw new ForbiddenException('Invalid signature');
    }
    const out = await this.events.record(sendgridEvents(body));
    this.logger.log(
      `SendGrid events accepted: ${out.received} received, ${out.stored} stored, ${out.unmatched} unmatched`,
    );
    return out;
  }

  @Post('resend-events')
  @HttpCode(200)
  async resend(
    @Req() req: Request,
    @Body() body: unknown,
    @Headers('svix-id') id?: string,
    @Headers('svix-timestamp') timestamp?: string,
    @Headers('svix-signature') signature?: string,
  ) {
    const secret = await this.secrets.resolve(
      'resend',
      'RESEND_WEBHOOK_SECRET',
    );
    if (!secret)
      throw new ServiceUnavailableException(
        'RESEND_WEBHOOK_SECRET is not configured.',
      );
    const raw = (req as Request & { rawBody?: Buffer }).rawBody;
    if (
      !raw ||
      !id ||
      !timestamp ||
      !signature ||
      !verifySvixSignature(secret, id, timestamp, raw, signature)
    ) {
      this.logger.warn(
        `Resend events refused: ${signature ? 'signature did not verify' : 'unsigned'}`,
      );
      throw new ForbiddenException('Invalid signature');
    }
    const event = resendEvent(body, id);
    const out = await this.events.record(event ? [event] : []);
    this.logger.log(
      `Resend events accepted: ${out.received} received, ${out.stored} stored, ${out.unmatched} unmatched`,
    );
    return out;
  }
}
