import {
  Controller,
  Post,
  Body,
  Header,
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
import { IntegrationSecretsService } from '../../integration-secrets/integration-secrets.service';
import { twiml } from './keyword-replies';

@SkipThrottle()
@Controller('webhooks/twilio')
export class TwilioController {
  private readonly logger = new Logger(TwilioController.name);

  constructor(
    private readonly twilioService: TwilioService,
    private readonly secrets: IntegrationSecretsService,
  ) {}

  /**
   * Answers with TwiML: the STOP confirmation or HELP text when the message
   * was a keyword, an empty <Response/> otherwise. Twilio sends the reply
   * on the number the contact wrote to.
   */
  @Post('inbound')
  @HttpCode(200)
  @Header('Content-Type', 'text/xml; charset=utf-8')
  async handleInbound(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Req() req: Request,
  ): Promise<string> {
    await this.verifyTwilioSignature(req, signature);

    if (!body || typeof body !== 'object' || !body.From || !body.To) {
      throw new BadRequestException('Missing required Twilio fields: From, To');
    }
    const result = await this.twilioService.handleInbound(body);
    return twiml(result.reply);
  }

  @Post('status')
  @HttpCode(200)
  async handleStatus(
    @Body() body: any,
    @Headers('x-twilio-signature') signature: string | undefined,
    @Req() req: Request,
  ) {
    await this.verifyTwilioSignature(req, signature);

    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid webhook payload');
    }
    return this.twilioService.handleStatus(body);
  }

  /**
   * Twilio signs requests using HMAC-SHA1 over the full URL + sorted POST params.
   * See: https://www.twilio.com/docs/usage/security#validating-requests
   */
  private async verifyTwilioSignature(
    req: Request,
    signature: string | undefined,
  ) {
    // The same token sending uses: saved on the Integrations page, else env.
    const authToken = await this.secrets.resolve('twilio', 'TWILIO_AUTH_TOKEN');
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

    // timingSafeEqual throws RangeError when lengths differ, which would
    // surface as a 500 instead of a clean rejection.
    const sigBuf = Buffer.from(signature, 'utf-8');
    const expBuf = Buffer.from(expected, 'utf-8');

    if (
      sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)
    ) {
      throw new ForbiddenException('Invalid Twilio signature');
    }
  }
}
