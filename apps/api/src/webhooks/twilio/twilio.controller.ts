import {
  Controller,
  Post,
  Body,
  Headers,
  Req,
  HttpCode,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';
import * as crypto from 'crypto';
import { TwilioService } from './twilio.service';

@SkipThrottle()
@Controller('webhooks/twilio')
export class TwilioController {
  private readonly logger = new Logger(TwilioController.name);

  constructor(private readonly twilioService: TwilioService) {}

  @Post('inbound')
  @HttpCode(200)
  async handleInbound(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    this.verifyTwilioSignature(req, signature);

    if (!body || typeof body !== 'object' || !body.From || !body.To) {
      throw new BadRequestException('Missing required Twilio fields: From, To');
    }
    return this.twilioService.handleInbound(body);
  }

  @Post('status')
  @HttpCode(200)
  async handleStatus(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    this.verifyTwilioSignature(req, signature);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid webhook payload');
    }
    return this.twilioService.handleStatus(body);
  }

  /**
   * Twilio signs requests using HMAC-SHA1 over the full URL + sorted POST params.
   * See: https://www.twilio.com/docs/usage/security#validating-requests
   */
  private verifyTwilioSignature(req: Request, signature: string | undefined) {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) {
      throw new ForbiddenException(
        'Webhook verification not configured — TWILIO_AUTH_TOKEN is required',
      );
    }

    if (!signature) {
      throw new ForbiddenException('Missing x-twilio-signature header');
    }

    const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const params = req.body as Record<string, string>;

    const data =
      url +
      Object.keys(params)
        .sort()
        .reduce((acc, key) => acc + key + params[key], '');

    const expected = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    if (
      !crypto.timingSafeEqual(
        Buffer.from(signature, 'utf-8'),
        Buffer.from(expected, 'utf-8'),
      )
    ) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }
}
