import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

const GLOBAL_ADMIN_ACCOUNTS = new Set(['GLOBAL', 'global']);
const GLOBAL_ADMIN_PERMISSIONS = new Set(['admin:all', 'control_plane:global']);
const GLOBAL_ADMIN_ROLES = new Set([
  'Platform Admin',
  'platform-admin',
  'platform_admin',
  'Super Admin',
  'super-admin',
  'super_admin',
]);

@Injectable()
export class GlobalAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const accountId = request.user?.accountId ?? request.accountId;
    const permissions = this.normalizeStringArray(request.user?.permissions);
    const roles = this.normalizeStringArray(request.user?.roles);

    if (
      (typeof accountId === 'string' && GLOBAL_ADMIN_ACCOUNTS.has(accountId)) ||
      permissions.some((permission) => GLOBAL_ADMIN_PERMISSIONS.has(permission)) ||
      roles.some((role) => GLOBAL_ADMIN_ROLES.has(role))
    ) {
      return true;
    }

    throw new ForbiddenException(
      'Global admin privileges are required for this resource',
    );
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === 'string');
    }
    if (typeof value === 'string') {
      return value.split(' ').filter(Boolean);
    }
    return [];
  }
}
