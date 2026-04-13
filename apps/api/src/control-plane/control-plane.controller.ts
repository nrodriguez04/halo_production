import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { ControlPlaneService } from './control-plane.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/decorators';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

@Controller('control-plane')
@UseGuards(AuthGuard, PermissionsGuard)
export class ControlPlaneController {
  constructor(private readonly controlPlaneService: ControlPlaneService) {}

  @Get()
  @Permissions('control_plane:read')
  async getStatus() {
    return this.controlPlaneService.getStatus();
  }

  @Put()
  @Permissions('control_plane:write')
  async updateStatus(
    @Body()
    body: {
      enabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      docusignEnabled?: boolean;
      externalDataEnabled?: boolean;
    },
    @CurrentUserId() userId: string,
  ) {
    return this.controlPlaneService.updateStatus(body, userId);
  }
}

