import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ControlPlaneService } from './control-plane.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

const UpdateControlPlaneSchema = z
  .object({
    enabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    marketingEmailEnabled: z.boolean().optional(),
    marketingSmsEnabled: z.boolean().optional(),
    docusignEnabled: z.boolean().optional(),
    externalDataEnabled: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
    aiDailyCostCap: z.number().min(0).optional(),
    apiDailyCostCap: z.number().min(0).optional(),
    agentAutonomy: z.enum(['draft_only', 'standard']).optional(),
    agentModels: z
      .object({
        cheap: z.string().trim().min(1).optional(),
        mid: z.string().trim().min(1).optional(),
        strong: z.string().trim().min(1).optional(),
      })
      .strict()
      .nullable()
      .optional(),
    autoEnrichEnabled: z.boolean().optional(),
    autoEnrichDailyCap: z.number().int().min(0).max(1000).optional(),
    defaultAssignmentFee: z.number().int().min(0).max(1_000_000).optional(),
    minNetProfit: z.number().int().min(0).max(1_000_000).optional(),
    dispositionCosts: z.number().int().min(0).max(1_000_000).optional(),
    minUnderwritingConfidence: z.number().min(0).max(1).optional(),
    requireVerifiedPof: z.boolean().optional(),
    revenueRecognition: z
      .enum(['on_funds_received', 'on_closing_confirmed'])
      .optional(),
    campaignFollowUpDays: z.number().int().min(1).max(30).optional(),
    campaignMaxFollowUps: z.number().int().min(0).max(5).optional(),
  })
  .strict();

@Controller('control-plane')
@UseGuards(AuthGuard, PermissionsGuard)
export class ControlPlaneController {
  constructor(
    private readonly controlPlaneService: ControlPlaneService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions('control_plane:read')
  async getStatus(@CurrentAccountId() accountId: string) {
    return this.controlPlaneService.getStatus(accountId);
  }

  @Put()
  @Permissions('control_plane:write')
  async updateStatus(
    @Body() body: unknown,
    @CurrentUserId() userId: string,
    @CurrentAccountId() accountId: string,
  ) {
    const data = UpdateControlPlaneSchema.parse(body);
    const result = await this.controlPlaneService.updateStatus(
      accountId,
      data,
      userId,
    );
    await this.auditService.log({
      accountId,
      userId,
      action: 'control_plane.update',
      resource: 'control-plane',
      details: data,
    });
    return result;
  }
}
