/**
 * Development-only authentication bypass.
 *
 * Two independent conditions must BOTH hold for this to engage:
 *
 *   1. `NODE_ENV` is not 'production'  — not configurable, so a stray env var
 *      in a production deploy can never switch authentication off.
 *   2. `HALO_DEV_AUTH_BYPASS === 'true'` — explicit, opt-in, absent by default.
 *
 * Keep this predicate as the single source of truth; callers must not
 * re-implement the condition.
 */
export function isDevAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.HALO_DEV_AUTH_BYPASS === 'true'
  );
}

/** Tenant the bypassed request acts as. Must match a seeded account. */
export function devBypassAccountId(): string {
  return process.env.HALO_DEV_BYPASS_ACCOUNT_ID || 'halo-hq';
}

export const DEV_BYPASS_USER_ID = 'dev-bypass-user';

/**
 * 'Tenant Admin' is in PermissionsGuard's ADMIN_ROLES, so admin-gated routes
 * resolve without special-casing that guard. 'Platform Admin' satisfies
 * GlobalAdminGuard, which protects the genuinely global resources (chaos
 * flags, integration secrets); the bypass user is the operator, so it gets
 * both.
 */
export function devBypassUser() {
  return {
    userId: DEV_BYPASS_USER_ID,
    accountId: devBypassAccountId(),
    permissions: ['control_plane:read', 'control_plane:write'],
    roles: ['Tenant Admin', 'Platform Admin'],
    claims: { sub: DEV_BYPASS_USER_ID, devBypass: true },
    session: null,
  };
}
