import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  BadRequestException,
} from '@nestjs/common';
import { TwilioService } from './twilio.service';

@Controller('webhooks/twilio')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post('inbound')
  @HttpCode(200)
  async handleInbound(
    @Body() body: any,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    if (!body || typeof body !== 'object' || !body.From || !body.To) {
      throw new BadRequestException('Missing required Twilio fields: From, To');
    }
    return this.twilioService.handleInbound(body);
  }

  @Post('status')
  @HttpCode(200)
  async handleStatus(
    @Body() body: any,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid webhook payload');
    }
    return this.twilioService.handleStatus(body);
  }
}

