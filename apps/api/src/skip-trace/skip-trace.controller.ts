import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import {
  LeadSkipTraceService,
  type SkipTraceSummary,
} from './lead-skip-trace.service';

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
  constructor(private readonly leadSkipTrace: LeadSkipTraceService) {}

  /**
   * Traces a lead of the caller's tenant. Found contacts are stored on the
   * lead encrypted; the response carries only masked previews and counts,
   * never the raw contacts or provider payload.
   */
  @Post('append-contacts')
  async appendContacts(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() raw: unknown,
  ): Promise<SkipTraceSummary> {
    const body = SkipTraceBody.parse(raw);
    return this.leadSkipTrace.traceLead({
      accountId,
      leadId: body.leadId,
      actor: 'user',
      userId,
      input: {
        propertyAddress: body.propertyAddress,
        ownerName: body.ownerName,
        ownerMailingAddress: body.ownerMailingAddress,
        city: body.city,
        state: body.state,
        zip: body.zip,
      },
    });
  }
}
