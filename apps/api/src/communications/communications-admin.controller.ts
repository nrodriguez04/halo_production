import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import { CommunicationsAdminService } from './communications-admin.service';

const TestSendSchema = z
  .object({ to: z.string().trim().email().max(254) })
  .strict();
const SuppressSchema = z
  .object({
    email: z.string().trim().email().max(254).nullable().optional(),
    phone: z.string().trim().min(7).max(20).nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const ReasonSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
const ConsentSchema = z
  .object({
    channel: z.enum(['email', 'sms', 'call']),
    source: z.enum(['written', 'form', 'verbal', 'recorded_call', 'other']),
    evidence: z.string().trim().min(5).max(2000),
    documentId: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

/** Communications settings, suppression and seller consent (docs/communications.md). */
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class CommunicationsAdminController {
  constructor(private admin: CommunicationsAdminService) {}

  @Get('communications/readiness')
  readiness(@CurrentAccountId() a: string) {
    return this.admin.readiness(a);
  }

  @Post('communications/test-send')
  @Permissions('control_plane:write')
  testSend(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.admin.testSend(a, u, input(TestSendSchema, body).to);
  }

  @Get('communications/suppressions')
  suppressions(
    @CurrentAccountId() a: string,
    @Query('source') source?: string,
    @Query('limit') limit?: string,
  ) {
    return this.admin.suppressions(a, {
      source,
      limit: Number(limit) || undefined,
    });
  }

  @Post('communications/suppressions')
  suppress(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.admin.suppress(a, u, input(SuppressSchema, body));
  }

  @Delete('communications/suppressions/:id')
  @Permissions('control_plane:write')
  unsuppress(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.unsuppress(a, u, id, input(ReasonSchema, body).reason);
  }

  @Get('communications/deliverability')
  deliverability(@CurrentAccountId() a: string, @Query('days') days?: string) {
    return this.admin.deliverability(
      a,
      Math.min(Math.max(Number(days) || 30, 1), 365),
    );
  }

  @Get('leads/:leadId/consents')
  consents(@CurrentAccountId() a: string, @Param('leadId') leadId: string) {
    return this.admin.leadConsents(a, leadId);
  }

  @Post('leads/:leadId/consents')
  recordConsent(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('leadId') leadId: string,
    @Body() body: unknown,
  ) {
    return this.admin.recordLeadConsent(
      a,
      leadId,
      u,
      input(ConsentSchema, body),
    );
  }

  @Post('leads/:leadId/consents/:consentId/revoke')
  revokeConsent(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('leadId') leadId: string,
    @Param('consentId') consentId: string,
  ) {
    return this.admin.revokeLeadConsent(a, leadId, consentId, u);
  }
}
