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

/**
 * Who is asking for contact PII, for PIIService: whether they may see it
 * unmasked, and who to record in the audit log when they do.
 */
export interface PiiViewer {
  accountId: string;
  userId: string | null;
  canReveal: boolean;
}

export function piiViewer(user: unknown): PiiViewer {
  const u = (user ?? {}) as { accountId?: unknown; userId?: unknown };
  return {
    accountId: typeof u.accountId === 'string' ? u.accountId : '',
    userId: typeof u.userId === 'string' ? u.userId : null,
    canReveal: canRevealContactPii(user),
  };
}
