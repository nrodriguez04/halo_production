import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { GlobalAdminGuard } from '../auth/global-admin.guard';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { OpsAlertService, environmentLabel } from './ops-alert.service';

@Controller('admin/alerts')
@UseGuards(AuthGuard, PermissionsGuard, GlobalAdminGuard)
@Permissions('control_plane:write')
export class AlertsController {
  constructor(private readonly alerts: OpsAlertService) {}

  /** Whether a webhook is configured (never the URL itself). */
  @Get()
  status() {
    return {
      configured: this.alerts.configured(),
      environment: environmentLabel(),
    };
  }

  /** Sends a test alert so the operator can see the webhook works. */
  @Post('test')
  async test() {
    const delivered = await this.alerts.send({
      title: 'Test alert',
      severity: 'info',
      fingerprint: `test:${Date.now()}`,
      lines: [
        'If you can read this, error and downtime alerts will reach you here.',
      ],
    });
    return { configured: this.alerts.configured(), delivered };
  }
}
