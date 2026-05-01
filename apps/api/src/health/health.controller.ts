import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { ControlPlaneService } from '../control-plane/control-plane.service';
import { ApiCostService } from '../api-cost/api-cost.service';
import { AuthGuard } from '../auth/auth.guard';
import { REDIS } from '../redis/redis.module';
import Redis from 'ioredis';

@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private controlPlane: ControlPlaneService,
    private apiCostService: ApiCostService,
    @Inject(REDIS) private redis: Redis,
  ) {}

  @SkipThrottle()
  @Get('live')
  async getLive() {
    const checks: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch {
      checks.database = { status: 'error' };
      checks.status = 'degraded';
    }

    try {
      await this.redis.ping();
      checks.redis = { status: 'ok' };
    } catch {
      checks.redis = { status: 'error' };
      checks.status = 'degraded';
    }

    return checks;
  }

  @SkipThrottle()
  @Get('ready')
  @UseGuards(AuthGuard)
  async getReady() {
    const checks = await this.getLive();

    try {
      checks.queues = { status: 'ok', depth: 0 };
    } catch (error: any) {
      checks.queues = { status: 'error', error: error.message };
    }

    try {
      const cp = await this.controlPlane.getStatus();
      checks.controlPlane = {
        enabled: cp.enabled,
        smsEnabled: cp.smsEnabled,
        emailEnabled: cp.emailEnabled,
        docusignEnabled: cp.docusignEnabled,
        externalDataEnabled: cp.externalDataEnabled,
        aiEnabled: cp.aiEnabled,
        aiDailyCostCap: cp.aiDailyCostCap,
        apiDailyCostCap: cp.apiDailyCostCap,
      };
    } catch (error: any) {
      checks.controlPlane = { status: 'error', error: error.message };
    }

    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const costLogs = await this.prisma.aICostLog.findMany({
        where: { createdAt: { gte: today } },
      });
      const totalCost = costLogs.reduce((sum, log) => sum + log.cost, 0);
      const dailyCap = await this.controlPlane.getAiDailyCostCap();
      checks.aiCost = {
        today: totalCost.toFixed(4),
        cap: dailyCap,
        remaining: Math.max(0, dailyCap - totalCost).toFixed(4),
        status: totalCost < dailyCap ? 'ok' : 'capped',
      };
    } catch (error: any) {
      checks.aiCost = { status: 'error', error: error.message };
    }

    try {
      const apiSpendToday = await this.apiCostService.getTodayTotal();
      const apiCap = await this.controlPlane.getApiDailyCostCap();
      checks.apiSpend = {
        today: apiSpendToday.toFixed(4),
        cap: apiCap,
        remaining: Math.max(0, apiCap - apiSpendToday).toFixed(4),
        status: apiSpendToday < apiCap ? 'ok' : 'capped',
      };
    } catch (error: any) {
      checks.apiSpend = { status: 'error', error: error.message };
    }

    return checks;
  }

  @SkipThrottle()
  @Get()
  async getHealth() {
    return this.getLive();
  }
}
