import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { Redis } from 'ioredis';

@Controller('health')
export class HealthController {
  private redis: Redis;

  constructor(private prisma: PrismaService) {
    this.redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }

  @Get()
  async getHealth() {
    const checks: Record<string, any> = {
      timestamp: new Date().toISOString(),
      status: 'ok',
    };

    // DB connectivity
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok' };
    } catch (error) {
      checks.database = { status: 'error', error: error.message };
      checks.status = 'degraded';
    }

    // Redis connectivity
    try {
      await this.redis.ping();
      checks.redis = { status: 'ok' };
    } catch (error) {
      checks.redis = { status: 'error', error: error.message };
      checks.status = 'degraded';
    }

    // Queue depth (basic check)
    try {
      // This will be enhanced when BullMQ is set up
      checks.queues = { status: 'ok', depth: 0 };
    } catch (error) {
      checks.queues = { status: 'error', error: error.message };
    }

    // Control plane status
    try {
      const controlPlane = await this.prisma.controlPlane.findFirst();
      checks.controlPlane = {
        enabled: controlPlane?.enabled ?? true,
        smsEnabled: controlPlane?.smsEnabled ?? true,
        emailEnabled: controlPlane?.emailEnabled ?? true,
        docusignEnabled: controlPlane?.docusignEnabled ?? true,
        externalDataEnabled: controlPlane?.externalDataEnabled ?? true,
      };
    } catch (error) {
      checks.controlPlane = { status: 'error', error: error.message };
    }

    // AI cost today
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const costLogs = await this.prisma.aICostLog.findMany({
        where: {
          createdAt: { gte: today },
        },
      });
      const totalCost = costLogs.reduce((sum, log) => sum + log.cost, 0);
      const dailyCap = parseFloat(process.env.OPENAI_DAILY_COST_CAP || '2.0');
      checks.aiCost = {
        today: totalCost.toFixed(4),
        cap: dailyCap,
        remaining: Math.max(0, dailyCap - totalCost).toFixed(4),
        status: totalCost < dailyCap ? 'ok' : 'capped',
      };
    } catch (error) {
      checks.aiCost = { status: 'error', error: error.message };
    }

    return checks;
  }
}

