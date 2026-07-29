import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { ChaosService } from './chaos.service';

@Controller('admin/chaos')
@UseGuards(AuthGuard, PermissionsGuard)
@Permissions('control_plane:write')
export class ChaosController {
  constructor(private readonly chaosService: ChaosService) {}

  @Post('twilio-429')
  async simulateTwilio429() {
    return this.chaosService.simulateTwilio429();
  }

  @Post('docusign-outage')
  async simulateDocusignOutage() {
    return this.chaosService.simulateDocusignOutage();
  }

  @Post('attom-5xx')
  async simulateAttom5xx() {
    return this.chaosService.simulateAttom5xx();
  }

  @Post('clear')
  async clearChaos() {
    return this.chaosService.clearAll();
  }

  @Get('status')
  async getStatus() {
    return this.chaosService.getStatus();
  }
}

@Controller('admin/dlq')
@UseGuards(AuthGuard, PermissionsGuard)
@Permissions('control_plane:read')
export class DLQController {
  constructor(private readonly chaosService: ChaosService) {}

  @Get()
  async listFailedJobs(
    @CurrentAccountId() accountId: string,
    @Query('queue') queue?: string,
  ) {
    return this.chaosService.listFailedJobs(accountId, queue);
  }

  @Post(':jobId/replay')
  @Permissions('control_plane:write')
  async replayJob(
    @CurrentAccountId() accountId: string,
    @Param('jobId') jobId: string,
    @Query('queue') queue: string,
  ) {
    return this.chaosService.replayJob(queue, jobId, accountId);
  }
}
