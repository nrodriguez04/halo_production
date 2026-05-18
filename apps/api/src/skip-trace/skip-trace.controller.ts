import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { resolveInternalServiceContext } from '../auth/internal-service-context';
import { PrismaService } from '../prisma.service';
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
  constructor(
    private readonly service: SkipTraceService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('append-contacts')
  async appendContacts(
    @Req() request: Request,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() raw: unknown,
  ) {
    const body = SkipTraceBody.parse(raw);
    const lead = await this.prisma.lead.findUnique({
      where: { id: body.leadId },
      select: { accountId: true },
    });

    if (!lead) {
      throw new NotFoundException('lead not found');
    }

    const ctx = resolveInternalServiceContext(request, accountId);
    if (lead.accountId !== ctx.accountId) {
      throw new ForbiddenException(
        'Lead does not belong to the authenticated account',
      );
    }

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
      { accountId: ctx.accountId, actor: ctx.actor, userId, leadId: body.leadId },
    );
  }
}
