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
}
