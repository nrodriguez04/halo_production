import {
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { UnsubscribeService } from './unsubscribe.service';
import { brandName, escapeHtml } from './outbound-content';

/**
 * Public, unauthenticated: the target of the link and the List-Unsubscribe
 * header in every outbound email. The token is the authority (see
 * unsubscribe-token.ts).
 *
 * GET only shows a confirmation button, because mail scanners prefetch
 * links; the opt-out happens on POST, which is also what RFC 8058 one-click
 * unsubscribe sends (body `List-Unsubscribe=One-Click`).
 */
@Controller('unsubscribe')
export class UnsubscribeController {
  constructor(private readonly unsubscribe: UnsubscribeService) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  confirm(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): string {
    if (!this.unsubscribe.isValid(token)) {
      res.status(404);
      return page('This unsubscribe link is not valid.');
    }
    return page(
      `Stop receiving emails from ${escapeHtml(brandName())}?`,
      '<form method="post"><button type="submit">Unsubscribe</button></form>',
    );
  }

  @Post(':token')
  @HttpCode(200)
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  async submit(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const outcome = await this.unsubscribe.unsubscribe(token);
    if (outcome === 'invalid') {
      res.status(404);
      return page('This unsubscribe link is not valid.');
    }
    return page(
      `You have been unsubscribed. You will not receive further emails from ${escapeHtml(brandName())}.`,
    );
  }
}

function page(message: string, extra = ''): string {
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>Unsubscribe</title></head>' +
    '<body style="font-family:sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem">' +
    `<p>${message}</p>${extra}</body></html>`
  );
}
