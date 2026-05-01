import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AutomationService } from './automation.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { AuditService } from '../audit/audit.service';

const CreateRunSchema = z
  .object({
    source: z.string().optional(),
    agentName: z.string().optional(),
    workflowName: z.string().optional(),
    entityType: z.string().optional(),
    entityId: z.string().optional(),
    triggerType: z.string().optional(),
    inputJson: z.any().optional(),
    approvalRequired: z.boolean().optional(),
    modelProvider: z.string().optional(),
    modelName: z.string().optional(),
    promptVersion: z.string().optional(),
    parentRunId: z.string().optional(),
  })
  .strict();

const CompleteRunSchema = z
  .object({
    outputJson: z.any().optional(),
    decisionJson: z.any().optional(),
    estimatedValueUsd: z.number().optional(),
    realizedValueUsd: z.number().optional(),
    aiCostUsd: z.number().optional(),
    messageCostUsd: z.number().optional(),
    toolCostUsd: z.number().optional(),
  })
  .strict();

const FailRunSchema = z
  .object({
    errorJson: z.any().optional(),
  })
  .strict();

@Controller('automation')
@UseGuards(AuthGuard)
export class AutomationController {
  constructor(
    private readonly automationService: AutomationService,
    private readonly auditService: AuditService,
  ) {}

  @Get('runs')
  async listRuns(
    @CurrentAccountId() accountId: string,
    @Query('status') status?: string,
    @Query('source') source?: string,
    @Query('workflowName') workflowName?: string,
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.automationService.listRuns(accountId, {
      status: status as any,
      source,
      workflowName,
      entityType,
      entityId,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get('runs/:id')
  async getRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.automationService.getRun(runId, accountId);
  }

  @Post('runs')
  async createRun(
    @CurrentAccountId() accountId: string,
    @Body() body: unknown,
  ) {
    const data = CreateRunSchema.parse(body);
    return this.automationService.createRun({
      tenantId: accountId,
      ...data,
      triggerType: data.triggerType as any,
    });
  }

  @Post('runs/:id/start')
  async startRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.automationService.startRun(runId, accountId);
  }

  @Post('runs/:id/complete')
  async completeRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: unknown,
  ) {
    const data = CompleteRunSchema.parse(body);
    return this.automationService.completeRun(runId, accountId, data);
  }

  @Post('runs/:id/fail')
  async failRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: unknown,
  ) {
    const data = FailRunSchema.parse(body);
    return this.automationService.failRun(runId, accountId, data.errorJson);
  }

  @Post('runs/:id/cancel')
  async cancelRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const result = await this.automationService.cancelRun(runId, accountId);
    await this.auditService.log({
      accountId,
      userId,
      action: 'automation.run.cancel',
      resource: `automation-run:${runId}`,
      details: { runId },
    });
    return result;
  }

  @Post('runs/:id/approve')
  async approveRun(
    @Param('id') runId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const result = await this.automationService.approveRun(
      runId,
      accountId,
      userId,
    );
    await this.auditService.log({
      accountId,
      userId,
      action: 'automation.run.approve',
      resource: `automation-run:${runId}`,
      details: { runId },
    });
    return result;
  }
}
