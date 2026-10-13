import { Prisma } from '@prisma/client';
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AI_PROVIDER_KEYS } from '@halo/shared';

/** Reserved accountId for the platform-wide master switch. */
export const GLOBAL_ACCOUNT_ID = 'GLOBAL';

export interface ControlPlaneStatus {
  accountId: string;
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  docusignEnabled: boolean;
  externalDataEnabled: boolean;
  aiEnabled: boolean;
  aiDailyCostCap: number;
  apiDailyCostCap: number;
  /** Agent autonomy tier: draft_only (default) or standard. */
  agentAutonomy: string;
  /** Model per tier; null means the platform default. */
  agentModels: Record<string, string> | null;
  /** New leads are enriched automatically, up to the daily cap. */
  autoEnrichEnabled: boolean;
  autoEnrichDailyCap: number;
  updatedAt?: Date;
  updatedBy?: string | null;
  /** True when a GLOBAL row is narrowing this tenant's settings. */
  globallyConstrained: boolean;
}

@Injectable()
export class ControlPlaneService {
  private readonly logger = new Logger(ControlPlaneService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Effective switches for one tenant.
   *
   * A flag is on only if the tenant row AND the GLOBAL row (when one exists)
   * both allow it, and each cap is the lower of the two. That makes GLOBAL a
   * true platform kill switch: it can restrict a tenant but never grant a
   * tenant more than it configured for itself.
   *
   * A missing tenant row means "never configured", so the row is provisioned
   * at the documented defaults and persisted -- visible in the admin UI
   * rather than an invisible in-memory assumption. Read failures are NOT
   * swallowed: callers must not proceed as if everything were enabled when
   * the switch state is unknown.
   *
   * `provision: false` is for the send path, which must not switch a tenant
   * on by reading its switches: there a missing row reads as everything
   * off, as it does in the worker.
   */
  async getStatus(
    accountId: string,
    opts: { provision?: boolean } = {},
  ): Promise<ControlPlaneStatus> {
    const [tenantRow, globalRow] = await Promise.all([
      this.prisma.controlPlane.findUnique({ where: { accountId } }),
      this.prisma.controlPlane.findUnique({
        where: { accountId: GLOBAL_ACCOUNT_ID },
      }),
    ]);

    if (!tenantRow && opts.provision === false) {
      return {
        accountId,
        enabled: false,
        smsEnabled: false,
        emailEnabled: false,
        docusignEnabled: false,
        externalDataEnabled: false,
        aiEnabled: false,
        aiDailyCostCap: 0,
        apiDailyCostCap: 0,
        agentAutonomy: 'draft_only',
        agentModels: null,
        autoEnrichEnabled: false,
        autoEnrichDailyCap: 0,
        globallyConstrained: !!globalRow,
      };
    }

    const tenant = tenantRow ?? (await this.provision(accountId));

    if (!globalRow) {
      return {
        ...tenant,
        agentModels: tenant.agentModels as Record<string, string> | null,
        globallyConstrained: false,
      };
    }

    return {
      accountId: tenant.accountId,
      enabled: tenant.enabled && globalRow.enabled,
      smsEnabled: tenant.smsEnabled && globalRow.smsEnabled,
      emailEnabled: tenant.emailEnabled && globalRow.emailEnabled,
      docusignEnabled: tenant.docusignEnabled && globalRow.docusignEnabled,
      externalDataEnabled:
        tenant.externalDataEnabled && globalRow.externalDataEnabled,
      aiEnabled: tenant.aiEnabled && globalRow.aiEnabled,
      aiDailyCostCap: Math.min(tenant.aiDailyCostCap, globalRow.aiDailyCostCap),
      apiDailyCostCap: Math.min(
        tenant.apiDailyCostCap,
        globalRow.apiDailyCostCap,
      ),
      updatedAt: tenant.updatedAt,
      updatedBy: tenant.updatedBy,
      agentAutonomy: tenant.agentAutonomy,
      agentModels: tenant.agentModels as Record<string, string> | null,
      autoEnrichEnabled:
        tenant.autoEnrichEnabled && globalRow.autoEnrichEnabled,
      autoEnrichDailyCap: Math.min(
        tenant.autoEnrichDailyCap,
        globalRow.autoEnrichDailyCap,
      ),
      globallyConstrained: true,
    };
  }

  private async provision(accountId: string) {
    this.logger.log(
      `No control plane row for ${accountId}; provisioning at defaults.`,
    );
    return this.prisma.controlPlane.create({ data: { accountId } });
  }

  async updateStatus(
    accountId: string,
    updates: {
      enabled?: boolean;
      smsEnabled?: boolean;
      emailEnabled?: boolean;
      docusignEnabled?: boolean;
      externalDataEnabled?: boolean;
      aiEnabled?: boolean;
      aiDailyCostCap?: number;
      apiDailyCostCap?: number;
      agentAutonomy?: string;
      agentModels?: Record<string, string> | null;
      autoEnrichEnabled?: boolean;
      autoEnrichDailyCap?: number;
    },
    userId: string,
  ) {
    // A nullable Json column takes Prisma.JsonNull, not null.
    const { agentModels, ...rest } = updates;
    const data = {
      ...rest,
      ...(agentModels !== undefined
        ? { agentModels: agentModels === null ? Prisma.JsonNull : agentModels }
        : {}),
    };
    const cp = await this.prisma.controlPlane.upsert({
      where: { accountId },
      create: { accountId, ...data, updatedBy: userId },
      update: { ...data, updatedBy: userId },
    });

    // Bridge legacy ControlPlane caps into the cost-governance budget buckets
    // so callers reading either source see consistent limits.
    if (typeof updates.aiDailyCostCap === 'number') {
      for (const providerKey of AI_PROVIDER_KEYS) {
        await this.syncBucketCap(
          accountId,
          'global',
          providerKey,
          'day',
          updates.aiDailyCostCap,
        );
      }
    }
    if (typeof updates.apiDailyCostCap === 'number') {
      await this.syncBucketCap(
        accountId,
        'global',
        'ALL',
        'day',
        updates.apiDailyCostCap,
      );
    }

    return cp;
  }

  /**
   * Mirrors a cap into the matching budget bucket for the same tenant. Only
   * touches the caps -- current spend and the period window are left alone so
   * live counters do not reset.
   */
  private async syncBucketCap(
    accountId: string,
    scope: string,
    scopeRef: string,
    period: 'day' | 'week' | 'month',
    hardCapUsd: number,
  ) {
    const bucket = await this.prisma.integrationBudgetBucket.findFirst({
      where: { accountId, scope, scopeRef, period },
      orderBy: { periodStartedAt: 'desc' },
    });
    if (!bucket) return;
    await this.prisma.integrationBudgetBucket.update({
      where: { id: bucket.id },
      data: { hardCapUsd, softCapUsd: hardCapUsd * 0.8 },
    });
  }

  async isEnabled(accountId: string): Promise<boolean> {
    return (await this.getStatus(accountId)).enabled;
  }

  async isSmsEnabled(accountId: string): Promise<boolean> {
    const cp = await this.getStatus(accountId);
    return cp.enabled && cp.smsEnabled;
  }

  async isEmailEnabled(accountId: string): Promise<boolean> {
    const cp = await this.getStatus(accountId);
    return cp.enabled && cp.emailEnabled;
  }

  async isDocuSignEnabled(accountId: string): Promise<boolean> {
    const cp = await this.getStatus(accountId);
    return cp.enabled && cp.docusignEnabled;
  }

  async isExternalDataEnabled(accountId: string): Promise<boolean> {
    const cp = await this.getStatus(accountId);
    return cp.enabled && cp.externalDataEnabled;
  }

  async isAiEnabled(accountId: string): Promise<boolean> {
    const cp = await this.getStatus(accountId);
    return cp.enabled && cp.aiEnabled;
  }

  async getAiDailyCostCap(accountId: string): Promise<number> {
    return (await this.getStatus(accountId)).aiDailyCostCap;
  }

  async getApiDailyCostCap(accountId: string): Promise<number> {
    return (await this.getStatus(accountId)).apiDailyCostCap;
  }
}
