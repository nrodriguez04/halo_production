import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ControlPlaneService {
  constructor(private prisma: PrismaService) {}

  async getStatus() {
    let cp = await this.prisma.controlPlane.findFirst();
    
    if (!cp) {
      // Create default if doesn't exist
      cp = await this.prisma.controlPlane.create({
        data: {
          id: 'default',
          enabled: true,
          smsEnabled: true,
          emailEnabled: true,
          docusignEnabled: true,
          externalDataEnabled: true,
        },
      });
    }

    return cp;
  }

  async updateStatus(
    updates: {
      enabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      docusignEnabled?: boolean;
      externalDataEnabled?: boolean;
      aiEnabled?: boolean;
      aiDailyCostCap?: number;
      apiDailyCostCap?: number;
    },
    userId: string,
  ) {
    let cp = await this.prisma.controlPlane.findFirst();

    if (!cp) {
      cp = await this.prisma.controlPlane.create({
        data: {
          id: 'default',
          ...updates,
          updatedBy: userId,
        },
      });
    } else {
      cp = await this.prisma.controlPlane.update({
        where: { id: cp.id },
        data: {
          ...updates,
          updatedBy: userId,
        },
      });
    }

    // Bridge legacy ControlPlane caps into the cost-governance budget
    // buckets so callers that read either source see consistent limits.
    // The legacy field is per-day, the bucket is per-day too.
    if (typeof updates.aiDailyCostCap === 'number') {
      await this.syncBucketCap('global', 'openai', 'day', updates.aiDailyCostCap);
    }
    if (typeof updates.apiDailyCostCap === 'number') {
      await this.syncBucketCap('global', 'ALL', 'day', updates.apiDailyCostCap);
    }

    return cp;
  }

  /**
   * Mirrors a ControlPlane cap into the matching budget bucket. Only
   * updates `hardCapUsd` / `softCapUsd` - the current spend and period
   * window are left alone so live counters don't reset.
   */
  private async syncBucketCap(
    scope: string,
    scopeRef: string,
    period: 'day' | 'week' | 'month',
    hardCapUsd: number,
  ) {
    const bucket = await this.prisma.integrationBudgetBucket.findFirst({
      where: { accountId: 'GLOBAL', scope, scopeRef, period },
      orderBy: { periodStartedAt: 'desc' },
    });
    if (!bucket) return;
    await this.prisma.integrationBudgetBucket.update({
      where: { id: bucket.id },
      data: {
        hardCapUsd,
        softCapUsd: hardCapUsd * 0.8,
      },
    });
  }

  async isEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled;
  }

  async isSmsEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.smsEnabled;
  }

  async isEmailEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.emailEnabled;
  }

  async isDocuSignEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.docusignEnabled;
  }

  async isExternalDataEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.externalDataEnabled;
  }

  async isAiEnabled(): Promise<boolean> {
    const cp = await this.getStatus();
    return cp.enabled && cp.aiEnabled;
  }

  async getAiDailyCostCap(): Promise<number> {
    const cp = await this.getStatus();
    return cp.aiDailyCostCap;
  }

  async getApiDailyCostCap(): Promise<number> {
    const cp = await this.getStatus();
    return cp.apiDailyCostCap;
  }
}

