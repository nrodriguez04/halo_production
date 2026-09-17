import { prisma } from './prisma-client';

/** Reserved accountId for the platform-wide master switch. */
export const GLOBAL_ACCOUNT_ID = 'GLOBAL';

export interface WorkerControlPlane {
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  docusignEnabled: boolean;
  externalDataEnabled: boolean;
  aiEnabled: boolean;
  aiDailyCostCap: number;
  apiDailyCostCap: number;
}

/**
 * Everything off. Used when the switch state cannot be determined.
 *
 * The point of a kill switch is that flipping it off stops work, so an
 * unreadable control plane must stop work too. The processors previously
 * fell back to `{ enabled: true, ... }` on an empty or failed lookup, which
 * meant a database blip re-enabled every side effect.
 */
const ALL_DISABLED: WorkerControlPlane = {
  enabled: false,
  smsEnabled: false,
  emailEnabled: false,
  docusignEnabled: false,
  externalDataEnabled: false,
  aiEnabled: false,
  aiDailyCostCap: 0,
  apiDailyCostCap: 0,
};

/**
 * Effective switches for one tenant, mirroring ControlPlaneService in the api:
 * a flag is on only if the tenant row AND the GLOBAL row (when present) allow
 * it, and each cap is the lower of the two.
 *
 * Unlike the api this never provisions a missing row -- the worker is not the
 * right place to create tenant configuration. A tenant with no row is treated
 * as disabled until the api provisions it on first admin view.
 */
export async function getControlPlane(
  accountId: string,
): Promise<WorkerControlPlane> {
  if (!accountId) return ALL_DISABLED;

  try {
    const [tenant, global] = await Promise.all([
      prisma.controlPlane.findUnique({ where: { accountId } }),
      prisma.controlPlane.findUnique({
        where: { accountId: GLOBAL_ACCOUNT_ID },
      }),
    ]);

    if (!tenant) {
      console.warn(
        `[control-plane] no row for tenant ${accountId}; treating as disabled`,
      );
      return ALL_DISABLED;
    }

    if (!global) return tenant;

    return {
      enabled: tenant.enabled && global.enabled,
      smsEnabled: tenant.smsEnabled && global.smsEnabled,
      emailEnabled: tenant.emailEnabled && global.emailEnabled,
      docusignEnabled: tenant.docusignEnabled && global.docusignEnabled,
      externalDataEnabled:
        tenant.externalDataEnabled && global.externalDataEnabled,
      aiEnabled: tenant.aiEnabled && global.aiEnabled,
      aiDailyCostCap: Math.min(tenant.aiDailyCostCap, global.aiDailyCostCap),
      apiDailyCostCap: Math.min(tenant.apiDailyCostCap, global.apiDailyCostCap),
    };
  } catch (err) {
    console.error(
      `[control-plane] lookup failed for ${accountId}; failing closed:`,
      (err as Error).message,
    );
    return ALL_DISABLED;
  }
}
