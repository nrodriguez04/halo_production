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
    docusignEnabled: z.boolean().optional(),
    externalDataEnabled: z.boolean().optional(),
    aiEnabled: z.boolean().optional(),
    aiDailyCostCap: z.number().min(0).optional(),
    apiDailyCostCap: z.number().min(0).optional(),
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
  async getStatus() {
    return this.controlPlaneService.getStatus();
  }

  @Put()
  @Permissions('control_plane:write')
  async updateStatus(
    @Body() body: unknown,
    @CurrentUserId() userId: string,
    @CurrentAccountId() accountId: string,
  ) {
    const data = UpdateControlPlaneSchema.parse(body);
    const result = await this.controlPlaneService.updateStatus(data, userId);
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

