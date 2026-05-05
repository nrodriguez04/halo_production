import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { LeadStatus } from '@halo/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { LeadLifecycleService } from './lead-lifecycle.service';

// HTTP entrypoint to the lead state machine. Workers can call this
// with a service token; the UI uses it for the "qualify" / "reject"
// buttons on the triage page.

const TransitionBody = z.object({
  next: z.enum([
    'new',
    'enriching',
    'enriched',
    'contacted',
    'qualified',
    'disqualified',
  ]),
  reason: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

@Controller('lead-lifecycle')
@UseGuards(AuthGuard)
export class LeadLifecycleController {
  constructor(private readonly lifecycle: LeadLifecycleService) {}

  @Post(':leadId/transition')
  async transition(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('leadId') leadId: string,
    @Body() raw: unknown,
  ) {
    let body: z.infer<typeof TransitionBody>;
    try {
      body = TransitionBody.parse(raw);
    } catch (err: any) {
      throw new BadRequestException(err?.message ?? 'invalid body');
    }
    return this.lifecycle.transition({
      leadId,
      accountId,
      next: body.next as LeadStatus,
      actorId: userId,
      actorType: 'user',
      reason: body.reason,
      metadata: body.metadata,
    });
  }
}
