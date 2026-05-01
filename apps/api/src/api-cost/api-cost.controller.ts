import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiCostService } from './api-cost.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';

@Controller('analytics/api-spend')
@UseGuards(AuthGuard)
export class ApiCostController {
  constructor(private readonly apiCostService: ApiCostService) {}

  @Get()
  async getSummary(@CurrentAccountId() accountId: string) {
    return this.apiCostService.getSpendSummary(accountId);
  }

  @Get('by-provider')
  async getByProvider(
    @CurrentAccountId() accountId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;
    return this.apiCostService.getSpendByProvider(accountId, start, end);
  }

  @Get('daily-trend')
  async getDailyTrend(
    @CurrentAccountId() accountId: string,
    @Query('days') days?: string,
  ) {
    return this.apiCostService.getDailyTrend(accountId, days ? parseInt(days) : 30);
  }

  @Get('endpoint-breakdown')
  async getEndpointBreakdown(
    @CurrentAccountId() accountId: string,
    @Query('provider') provider: string,
  ) {
    return this.apiCostService.getEndpointBreakdown(accountId, provider);
  }

  @Get('today')
  async getToday(@CurrentAccountId() accountId: string) {
    return this.apiCostService.getTodaySpend(accountId);
  }
}
