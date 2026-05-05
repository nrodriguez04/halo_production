import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PrismaService } from '../prisma.service';
import { IntegrationCostControlService } from './cost-control.service';

// Admin endpoints for the cost-governance system:
//   - GET  /cost-governance/decisions/pending   list intents awaiting manual approval
//   - POST /cost-governance/decisions/:id/approve
//   - POST /cost-governance/overrides           grant a per-lead/campaign budget bump
//   - POST /cost-governance/feature-flags       toggle a provider per-tenant
//   - GET  /cost-governance/buckets             current spend across budget buckets

const ApproveBody = z.object({ note: z.string().optional() });
const OverrideBody = z.object({
  scope: z.enum(['lead', 'campaign', 'workflow']),
  scopeRef: z.string().min(1),
  reason: z.string().min(1),
  extraBudgetUsd: z.number().positive(),
  expiresInHours: z.number().int().positive().max(24 * 30).default(72),
});
const FeatureFlagBody = z.object({
  flag: z.string().min(1),
  enabled: z.boolean(),
  reason: z.string().optional(),
  expiresInHours: z.number().int().positive().max(24 * 365).optional(),
});

@Controller('cost-governance')
@UseGuards(AuthGuard, PermissionsGuard)
export class CostControlController {
  constructor(
    private readonly costControl: IntegrationCostControlService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('decisions/pending')
  @Permissions('control_plane:read')
  async pendingDecisions(@CurrentAccountId() accountId: string) {
    return this.prisma.integrationCostEvent.findMany({
      where: {
        accountId,
        decision: 'REQUIRE_MANUAL_APPROVAL',
        status: 'reserved',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  @Post('decisions/:reservationId/approve')
  @Permissions('control_plane:write')
  async approveDecision(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('reservationId') reservationId: string,
    @Body() raw: unknown,
  ) {
    const body = ApproveBody.parse(raw);
    const event = await this.prisma.integrationCostEvent.findUnique({
      where: { reservationId },
    });
    if (!event || event.accountId !== accountId) {
      throw new NotFoundException('reservation not found');
    }
    if (event.decision !== 'REQUIRE_MANUAL_APPROVAL' || event.status !== 'reserved') {
      throw new BadRequestException('reservation is not awaiting approval');
    }
    // Approving a manual-approval reservation flips the decision so the
    // adapter caller can re-execute with `hints.skipBudget=false`. The
    // approval row also gets a TimelineEvent for audit.
    await this.prisma.$transaction([
      this.prisma.integrationCostEvent.update({
        where: { reservationId },
        data: {
          decision: 'ALLOW_MANUAL',
          metadata: {
            ...((event.metadata as object | null) ?? {}),
            approvedBy: userId,
            approvedAt: new Date().toISOString(),
            note: body.note ?? null,
          },
        },
      }),
      this.prisma.timelineEvent.create({
        data: {
          tenantId: accountId,
          entityType: 'JOB' as const,
          entityId: event.id,
          eventType: 'cost_governance.manual_approval_granted',
          actorType: 'user' as const,
          actorId: userId,
          payloadJson: {
            providerKey: event.providerKey,
            action: event.action,
            estimatedCostUsd: event.estimatedCostUsd,
            note: body.note ?? null,
          },
        },
      }),
    ]);
    return { ok: true };
  }

  @Post('overrides')
  @Permissions('control_plane:write')
  async createOverride(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() raw: unknown,
  ) {
    const body = OverrideBody.parse(raw);
    const expiresAt = new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000);
    const override = await this.prisma.manualBudgetOverride.create({
      data: {
        accountId,
        scope: body.scope,
        scopeRef: body.scopeRef,
        reason: body.reason,
        approvedBy: userId,
        extraBudgetUsd: body.extraBudgetUsd,
        expiresAt,
      },
    });
    this.costControl.invalidateOverrideCache(accountId);
    return override;
  }

  @Post('feature-flags')
  @Permissions('control_plane:write')
  async toggleFlag(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() raw: unknown,
  ) {
    const body = FeatureFlagBody.parse(raw);
    const expiresAt = body.expiresInHours
      ? new Date(Date.now() + body.expiresInHours * 60 * 60 * 1000)
      : undefined;
    const result = await this.prisma.integrationFeatureFlag.upsert({
      where: { accountId_flag: { accountId, flag: body.flag } },
      create: {
        accountId,
        flag: body.flag,
        enabled: body.enabled,
        reason: body.reason,
        enabledAt: body.enabled ? new Date() : null,
        expiresAt,
        updatedBy: userId,
      },
      update: {
        enabled: body.enabled,
        reason: body.reason,
        enabledAt: body.enabled ? new Date() : null,
        expiresAt,
        updatedBy: userId,
      },
    });
    this.costControl.invalidateProviderCache();
    return result;
  }

  @Get('buckets')
  @Permissions('control_plane:read')
  async listBuckets(
    @CurrentAccountId() accountId: string,
    @Query('scope') scope?: string,
  ) {
    return this.prisma.integrationBudgetBucket.findMany({
      where: {
        accountId: { in: [accountId, 'GLOBAL'] },
        enabled: true,
        ...(scope ? { scope } : {}),
      },
      orderBy: [{ scope: 'asc' }, { period: 'asc' }, { scopeRef: 'asc' }],
    });
  }

  @Get('events')
  @Permissions('control_plane:read')
  async listEvents(
    @CurrentAccountId() accountId: string,
    @Query('limit') limit?: string,
    @Query('decision') decision?: string,
  ) {
    return this.prisma.integrationCostEvent.findMany({
      where: {
        accountId,
        ...(decision ? { decision } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit ?? '100', 10), 500),
    });
  }
}
