import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import type { CostActor } from '../cost-control/dto/cost-intent.dto';
import { CurrentAccountId, CurrentUser, CurrentUserId } from '../auth/decorators';
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
    @CurrentUser() user: { actor?: string } | undefined,
    @Body() raw: unknown,
  ) {
    const body = SkipTraceBody.parse(raw);
    const actor: CostActor =
      user?.actor === 'worker' || user?.actor === 'system'
        ? user.actor
        : 'user';
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
        userId: actor === 'user' ? userId : undefined,
        leadId: body.leadId,
      },
    );
  }
}
