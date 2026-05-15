import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { resolveInternalServiceContext } from '../auth/internal-service-context';
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
    @Headers('authorization') authorization: string | undefined,
    @Headers('x-halo-account-id') requestedAccountId: string | undefined,
    @Body() raw: unknown,
  ) {
    const body = SkipTraceBody.parse(raw);
    const ctx = resolveInternalServiceContext({
      currentAccountId: accountId,
      currentUserId: userId,
      authorizationHeader: authorization,
      requestedAccountId,
      internalToken: process.env.INTERNAL_API_TOKEN,
      internalActor: 'worker',
    });

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
      { ...ctx, leadId: body.leadId },
    );
  }
}
