import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { PublicDealPagesService } from './public-deal-pages.service';
import { PublicResponseSchema } from './disposition.schemas';

/**
 * Buyer deal pages: no session, the token is the credential. Nothing here
 * reveals a deal that is not marketed (an unknown or dead token is a 404 or
 * 410 with no detail), and responses are tightly rate limited.
 */
@Controller('public/deal-pages')
@Throttle({
  short: { limit: 5, ttl: 1000 },
  medium: { limit: 40, ttl: 60_000 },
})
export class PublicDealPagesController {
  constructor(private pages: PublicDealPagesService) {}

  @Get(':token')
  view(@Param('token') token: string) {
    return this.pages.view(token);
  }

  @Get(':token/files/:documentId')
  async file(
    @Param('token') token: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { body, contentType, fileName } = await this.pages.file(
      token,
      documentId,
    );
    const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
    const inline =
      contentType.startsWith('image/') || contentType === 'application/pdf';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    body.pipe(res);
  }

  @Post(':token/respond')
  @Throttle({
    short: { limit: 2, ttl: 1000 },
    medium: { limit: 10, ttl: 60_000 },
  })
  respond(
    @Param('token') token: string,
    @Body() body: unknown,
    @Req() req: Request,
  ) {
    const input = PublicResponseSchema.parse(body);
    return this.pages.respond(
      token,
      input as Parameters<PublicDealPagesService['respond']>[1],
      {
        ip: req.ip ?? null,
        userAgent: req.headers['user-agent'] ?? null,
      },
    );
  }
}
