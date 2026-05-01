import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';

@Controller('analytics')
@UseGuards(AuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

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
  async getAutomationByWorkflow(
    @CurrentAccountId() accountId: string,
  ) {
    return this.analyticsService.getAutomationByWorkflow(accountId);
  }

  @Get('automation/by-agent')
  async getAutomationByAgent(
    @CurrentAccountId() accountId: string,
  ) {
    return this.analyticsService.getAutomationByAgent(accountId);
  }

  @Get('automation/agent-cards')
  async getAutomationAgentCards(
    @CurrentAccountId() accountId: string,
  ) {
    return this.analyticsService.getAutomationAgentCards(accountId);
  }
}
