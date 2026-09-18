import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { SkipTraceService } from './skip-trace.service';
import { PrismaService } from '../prisma.service';
import { LeadPiiService } from '../leads/lead-pii.service';

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
    private readonly pii: LeadPiiService,
  ) {}

  @Post('append-contacts')
  async appendContacts(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() raw: unknown,
  ) {
    const body = SkipTraceBody.parse(raw);
    // Re-shape into SkipTraceInput so optional fields stay optional and
    // the required `leadId` is preserved.
    const result = await this.service.appendContacts(
      {
        leadId: body.leadId,
        propertyAddress: body.propertyAddress,
        ownerName: body.ownerName,
        ownerMailingAddress: body.ownerMailingAddress,
        city: body.city,
        state: body.state,
        zip: body.zip,
      },
      { accountId, actor: 'user', userId, leadId: body.leadId },
    );

    // Persist here, encrypted, rather than handing plaintext back for the
    // caller to write: the worker holds no PII keys. Only fills empty
    // fields, tenant-scoped, and never fails the trace.
    const phone = result.phones[0]?.number ?? null;
    const email = result.emails[0]?.email ?? null;
    if (result.status !== 'error' && (phone || email)) {
      if (phone) {
        await this.prisma.lead.updateMany({
          where: { id: body.leadId, accountId, canonicalPhone: null },
          data: this.pii.protect({ phone }),
        });
      }
      if (email) {
        await this.prisma.lead.updateMany({
          where: { id: body.leadId, accountId, canonicalEmail: null },
          data: this.pii.protect({ email }),
        });
      }
    }
    return result;
  }
}
