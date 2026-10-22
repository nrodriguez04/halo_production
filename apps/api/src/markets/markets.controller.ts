import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ACTIVATION_STATUSES,
  AUTHORIZATION_KINDS,
  MARKET_CLASSIFICATIONS,
} from '@halo/shared';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import { MarketsService } from './markets.service';

/** Drafting policies, recording authorizations, importing research. */
export const COMPLIANCE_WRITE = 'compliance:write';
/** Counsel's approval of a policy or template, verifying an authorization. */
export const COMPLIANCE_APPROVE = 'compliance:approve';
/** Moving a market up or down the activation ladder. */
export const MARKETS_ACTIVATE = 'markets:activate';

const DraftSchema = z
  .object({
    content: z.unknown().optional(),
    classification: z.enum(MARKET_CLASSIFICATIONS).optional(),
  })
  .strict();

const ApproveSchema = z
  .object({
    counselName: z.string().trim().min(2).max(200),
    counselFirm: z.string().trim().max(200).nullable().optional(),
    memoDocumentId: z.string().trim().min(1).max(64),
    attest: z.literal(true),
    reviewExpiresAt: z.coerce.date().nullable().optional(),
  })
  .strict();

const NoteSchema = z
  .object({ note: z.string().trim().min(3).max(2000) })
  .strict();

const StatusSchema = z
  .object({
    status: z.enum(ACTIVATION_STATUSES),
    note: z.string().trim().min(3).max(2000),
  })
  .strict();

const OperatorSchema = z
  .object({
    operatorUserId: z.string().trim().min(1).max(128).nullable(),
    operatorName: z.string().trim().min(1).max(200).nullable(),
  })
  .strict();

const AuthorizationSchema = z
  .object({
    kind: z.enum(AUTHORIZATION_KINDS),
    holderName: z.string().trim().min(2).max(200),
    holderType: z.enum(['company', 'operator', 'broker_partner']).optional(),
    holderUserId: z.string().trim().max(128).nullable().optional(),
    identifier: z.string().trim().max(120).nullable().optional(),
    issuedAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    documentId: z.string().trim().max(64).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const AuthorizationPatchSchema = z
  .object({
    holderName: z.string().trim().min(2).max(200).optional(),
    identifier: z.string().trim().max(120).nullable().optional(),
    issuedAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    documentId: z.string().trim().max(64).nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const ReasonSchema = z
  .object({ reason: z.string().trim().min(3).max(1000) })
  .strict();

const ImportSchema = z
  .object({
    states: z.array(z.string().trim().min(2).max(40)).max(51).optional(),
    overwrite: z.boolean().optional(),
  })
  .strict();

/**
 * Markets (docs/markets.md): the activation matrix, policies, counsel's
 * approvals, authorizations, research and the self-test.
 */
@Controller('markets')
@UseGuards(AuthGuard, PermissionsGuard)
export class MarketsController {
  constructor(private markets: MarketsService) {}

  @Get()
  matrix(@CurrentAccountId() a: string) {
    return this.markets.matrix(a);
  }

  @Get('reference')
  reference() {
    return {
      jurisdictions: this.markets.jurisdictions(),
      authorizationKinds: this.markets.authorizationKinds(),
    };
  }

  @Post('research/import')
  @Permissions(COMPLIANCE_WRITE)
  importResearch(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.markets.importResearch(a, u, input(ImportSchema, body ?? {}));
  }

  @Patch('authorizations/:id')
  @Permissions(COMPLIANCE_WRITE)
  updateAuthorization(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.markets.updateAuthorization(
      a,
      id,
      u,
      input(AuthorizationPatchSchema, body),
    );
  }

  @Post('authorizations/:id/verify')
  @Permissions(COMPLIANCE_APPROVE)
  verifyAuthorization(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.markets.verifyAuthorization(a, id, u);
  }

  @Post('authorizations/:id/revoke')
  @Permissions(COMPLIANCE_WRITE)
  revokeAuthorization(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.markets.revokeAuthorization(
      a,
      id,
      u,
      input(ReasonSchema, body).reason,
    );
  }

  @Get(':state')
  detail(@CurrentAccountId() a: string, @Param('state') state: string) {
    return this.markets.detail(a, state);
  }

  @Get(':state/versions/:version')
  version(
    @CurrentAccountId() a: string,
    @Param('state') state: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.markets.version(a, state, version);
  }

  @Put(':state/draft')
  @Permissions(COMPLIANCE_WRITE)
  updateDraft(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.updateDraft(a, state, u, input(DraftSchema, body));
  }

  @Post(':state/submit')
  @Permissions(COMPLIANCE_WRITE)
  submit(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
  ) {
    return this.markets.submit(a, state, u);
  }

  @Post(':state/return')
  @Permissions(COMPLIANCE_APPROVE)
  returnToDraft(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.returnToDraft(
      a,
      state,
      u,
      input(NoteSchema, body).note,
    );
  }

  @Post(':state/approve')
  @Permissions(COMPLIANCE_APPROVE)
  approve(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.approve(a, state, u, input(ApproveSchema, body));
  }

  @Post(':state/status')
  @Permissions(MARKETS_ACTIVATE)
  setStatus(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.setStatus(a, state, u, input(StatusSchema, body));
  }

  @Put(':state/operator')
  @Permissions(MARKETS_ACTIVATE)
  setOperator(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.setOperator(a, state, u, input(OperatorSchema, body));
  }

  @Post(':state/authorizations')
  @Permissions(COMPLIANCE_WRITE)
  createAuthorization(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
    @Body() body: unknown,
  ) {
    return this.markets.createAuthorization(
      a,
      state,
      u,
      input(AuthorizationSchema, body),
    );
  }

  @Post(':state/self-test')
  @Permissions(COMPLIANCE_WRITE)
  selfTest(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('state') state: string,
  ) {
    return this.markets.selfTest(a, state, u);
  }
}
