import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { SkipTraceService } from './skip-trace.service';

const SkipTraceBody = z.object({
  leadId: z.string(),
  propertyAddress: z.string(),
  ownerName: z.string().optional(),
  ownerMailingAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

@Controller('skip-trace')
@UseGuards(AuthGuard)
export class SkipTraceController {
  constructor(private readonly service: SkipTraceService) {}

  @Post('append-contacts')
  async appendContacts(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string | undefined,
    @Body() raw: unknown,
    @Req() request: Request,
  ) {
    const body = SkipTraceBody.parse(raw);
    const actor = readActor(request);
    // Re-shape into SkipTraceInput so optional fields stay optional and
    // the required `leadId` is preserved.
    return this.service.appendContacts(
      {
        leadId: body.leadId,
        propertyAddress: body.propertyAddress,
        ownerName: body.ownerName,
        ownerMailingAddress: body.ownerMailingAddress,
        city: body.city,
        state: body.state,
        zip: body.zip,
      },
      {
        accountId,
        actor,
        ...(userId ? { userId } : {}),
        leadId: body.leadId,
      },
    );
  }
}

function readActor(request: Request): 'user' | 'worker' | 'system' {
  const actor = (request as any).authActor;
  if (actor === 'worker') return 'worker';
  if (actor === 'system') return 'system';
  return 'user';
}
