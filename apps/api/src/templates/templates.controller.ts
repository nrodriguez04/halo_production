import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { TEMPLATE_KINDS } from '@halo/shared';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { OwnerRoleGuard } from '../auth/owner-role.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import {
  COMPLIANCE_APPROVE,
  COMPLIANCE_WRITE,
} from '../markets/markets.controller';
import { TemplatesService } from './templates.service';

const STATES = z.array(z.string().trim().min(2).max(40)).max(52);

const CreateSchema = z
  .object({
    kind: z.enum(TEMPLATE_KINDS),
    name: z.string().trim().min(3).max(200),
    description: z.string().trim().max(1000).nullable().optional(),
    disclosureKey: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,63}$/)
      .nullable()
      .optional(),
    documentId: z.string().trim().min(1).max(64),
    states: STATES,
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const VersionSchema = z
  .object({
    documentId: z.string().trim().min(1).max(64),
    states: STATES,
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const ApproveSchema = z
  .object({
    counselName: z.string().trim().min(2).max(200),
    counselFirm: z.string().trim().max(200).nullable().optional(),
    approvalDocumentId: z.string().trim().min(1).max(64),
    attest: z.literal(true),
    states: STATES.optional(),
  })
  .strict();

/** The owner accepts the text for named jurisdictions (docs/markets.md s6). */
const AcceptRiskSchema = z
  .object({
    acceptedByName: z.string().trim().min(2).max(200),
    reason: z.string().trim().min(20).max(4000),
    attest: z.literal(true),
    states: STATES.optional(),
  })
  .strict();

const RetireSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict();

const GenerateSchema = z
  .object({
    kind: z.enum(TEMPLATE_KINDS),
    disclosureKey: z.string().max(64).nullable().optional(),
    buyerId: z.string().max(64).nullable().optional(),
  })
  .strict();

@Controller('templates')
@UseGuards(AuthGuard, PermissionsGuard)
export class TemplatesController {
  constructor(private templates: TemplatesService) {}

  @Get()
  list(@CurrentAccountId() a: string) {
    return this.templates.list(a);
  }

  @Get('registry')
  registry() {
    return {
      kinds: this.templates.registry(),
      jurisdictions: this.templates.jurisdictionCodes(),
    };
  }

  @Post()
  @Permissions(COMPLIANCE_WRITE)
  create(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.templates.create(a, u, input(CreateSchema, body));
  }

  @Post('starter')
  @Permissions(COMPLIANCE_WRITE)
  starter(@CurrentAccountId() a: string, @CurrentUserId() u: string) {
    return this.templates.installStarters(a, u);
  }

  @Post(':id/versions')
  @Permissions(COMPLIANCE_WRITE)
  addVersion(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.addVersion(a, id, u, input(VersionSchema, body));
  }

  @Post('versions/:id/approve')
  @Permissions(COMPLIANCE_APPROVE)
  approve(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.approve(a, id, u, input(ApproveSchema, body));
  }

  @Post('versions/:id/accept-risk')
  @UseGuards(OwnerRoleGuard)
  acceptRisk(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.acceptRisk(a, id, u, input(AcceptRiskSchema, body));
  }

  @Post('versions/:id/retire')
  @Permissions(COMPLIANCE_WRITE)
  retire(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.templates.retire(a, id, u, input(RetireSchema, body).reason);
  }
}

/** Documents generated for a deal from approved templates. */
@Controller('deals/:dealId')
@UseGuards(AuthGuard, PermissionsGuard)
export class DealTemplatesController {
  constructor(private templates: TemplatesService) {}

  @Get('templates')
  forDeal(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.templates.forDeal(a, dealId);
  }

  @Post('documents/generate')
  generate(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.templates.generate(a, dealId, u, input(GenerateSchema, body));
  }
}
