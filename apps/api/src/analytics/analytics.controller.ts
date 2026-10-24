import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SpendInputSchema } from '@halo/shared';
import { AnalyticsService } from './analytics.service';
import { FunnelService } from './funnel.service';
import { MarketingSpendService } from './marketing-spend.service';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';

const OPERATOR = 'control_plane:write';
const DAY = 86_400_000;

function period(from?: string, to?: string): { from: Date; to: Date } {
  const end = to ? new Date(to) : new Date();
  const start = from ? new Date(from) : new Date(end.getTime() - 90 * DAY);
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start >= end
  )
    throw new BadRequestException('from must be a date before to');
  return { from: start, to: end };
}

@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly funnelService: FunnelService,
    private readonly spend: MarketingSpendService,
  ) {}

  /** Conversion economics for leads created in a period (default: the last 90 days). */
  @Get('funnel')
  funnel(
    @CurrentAccountId() accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.funnelService.funnel(accountId, {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
    });
  }

  /** Spend entered for the period (default: the last 90 days), newest first. */
  @Get('funnel/spend')
  listSpend(
    @CurrentAccountId() accountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.spend.list(accountId, period(from, to));
  }

  /** Records money spent getting leads that no provider call recorded: mail, ads, lists. */
  @Post('funnel/spend')
  @UseGuards(PermissionsGuard)
  @Permissions(OPERATOR)
  addSpend(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    return this.spend.add(accountId, userId, input(SpendInputSchema, body));
  }

  @Delete('funnel/spend/:id')
  @UseGuards(PermissionsGuard)
  @Permissions(OPERATOR)
  removeSpend(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.spend.remove(accountId, userId, id);
  }

  @Get('kpis')
  async getKPIs(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getKPIs(accountId, start, end);
  }

  @Get('trends')
  async getTrends(
    @CurrentAccountId() accountId: string,
    @Query('days') days?: string,
  ) {
    const daysNum = days ? parseInt(days, 10) : 30;
    return this.analyticsService.getTrends(accountId, daysNum);
  }

  @Get('automation/overview')
  async getAutomationOverview(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getAutomationOverview(accountId, start, end);
  }

  @Get('automation/runs')
  async getAutomationRuns(
    @CurrentAccountId() accountId: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.analyticsService.getAutomationRuns(accountId, {
      status,
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get('automation/costs')
  async getAutomationCosts(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getAutomationCosts(accountId, start, end);
  }

  @Get('automation/outcomes')
  async getAutomationOutcomes(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getAutomationOutcomes(accountId, start, end);
  }

  @Get('automation/roi')
  async getAutomationROI(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.analyticsService.getAutomationROI(accountId, start, end);
  }

  @Get('automation/by-workflow')
  async getAutomationByWorkflow(@CurrentAccountId() accountId: string) {
    return this.analyticsService.getAutomationByWorkflow(accountId);
  }

  @Get('automation/by-agent')
  async getAutomationByAgent(@CurrentAccountId() accountId: string) {
    return this.analyticsService.getAutomationByAgent(accountId);
  }

  @Get('automation/agent-cards')
  async getAutomationAgentCards(@CurrentAccountId() accountId: string) {
    return this.analyticsService.getAutomationAgentCards(accountId);
  }
}
