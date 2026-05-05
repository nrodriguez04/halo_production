import {
  Controller,
  Get,
  Put,
  Delete,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { IntegrationSecretsService } from './integration-secrets.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';
import { Permissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';

const SetSecretSchema = z
  .object({
    value: z.string().min(1),
  })
  .strict();

@Controller('integration-secrets')
@UseGuards(AuthGuard, PermissionsGuard)
export class IntegrationSecretsController {
  constructor(
    private readonly service: IntegrationSecretsService,
    private readonly auditService: AuditService,
  ) {}

  @Get()
  @Permissions('control_plane:read')
  async list() {
    return this.service.listSecrets();
  }

  @Put(':provider/:keyName')
  @Permissions('control_plane:write')
  async setSecret(
    @Param('provider') provider: string,
    @Param('keyName') keyName: string,
    @Body() body: unknown,
    @CurrentUserId() userId: string,
    @CurrentAccountId() accountId: string,
  ) {
    const data = SetSecretSchema.parse(body);
    const result = await this.service.setSecret(
      provider,
      keyName,
      data.value.trim(),
      userId,
    );
    await this.auditService.log({
      accountId,
      userId,
      action: 'secret.set',
      resource: `integration-secret:${provider}:${keyName}`,
      details: { provider, keyName },
    });
    return result;
  }

  @Delete(':provider/:keyName')
  @Permissions('control_plane:write')
  async deleteSecret(
    @Param('provider') provider: string,
    @Param('keyName') keyName: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    await this.service.deleteSecret(provider, keyName);
    await this.auditService.log({
      accountId,
      userId,
      action: 'secret.delete',
      resource: `integration-secret:${provider}:${keyName}`,
      details: { provider, keyName },
    });
    return { deleted: true };
  }

  @Post(':provider/test')
  @Permissions('control_plane:read')
  async testConnectivity(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('provider') provider: string,
  ) {
    return this.service.testConnectivity(provider, accountId, userId);
  }
}
