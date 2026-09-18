import { ADMIN_ROLES } from './permissions.guard';

/**
 * Whether a request may see unmasked contact PII (lead phone / email).
 * Admin roles and the explicit `pii:read` permission qualify; everyone
 * else gets masked values from the presentation layer.
 */
export function canRevealContactPii(user: unknown): boolean {
  const u = (user ?? {}) as { roles?: unknown; permissions?: unknown };
  const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
  const permissions = Array.isArray(u.permissions)
    ? (u.permissions as string[])
    : [];
  return (
    roles.some((r) => ADMIN_ROLES.includes(r)) ||
    permissions.includes('pii:read')
  );
}
