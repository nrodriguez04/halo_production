import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './decorators';
import { ADMIN_ROLES } from './permissions.guard';

interface SessionUser {
  userId?: string;
  accountId?: string;
  roles?: string[];
  permissions?: string[];
  claims?: Record<string, unknown>;
}

/**
 * The session as the API resolved it: which account, user, roles and
 * permissions a request carries. For the web's debugger and for diagnosing
 * sign-in; it repeats nothing the caller's own token does not already hold,
 * and no contact details.
 */
@Controller('auth')
@UseGuards(AuthGuard)
export class SessionController {
  @Get('session')
  session(@CurrentUser() user: SessionUser) {
    const claims = user?.claims ?? {};
    const roles = user?.roles ?? [];
    const exp =
      typeof claims.exp === 'number'
        ? new Date(claims.exp * 1000).toISOString()
        : null;
    const tenants =
      claims.tenants && typeof claims.tenants === 'object'
        ? Object.keys(claims.tenants as object)
        : [];
    return {
      accountId: user?.accountId ?? null,
      userId: user?.userId ?? null,
      roles,
      permissions: user?.permissions ?? [],
      admin: roles.some((r) => ADMIN_ROLES.includes(r)),
      tenants,
      expiresAt: exp,
      devBypass: claims.devBypass === true,
    };
  }
}
