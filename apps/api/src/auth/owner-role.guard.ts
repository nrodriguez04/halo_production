import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ADMIN_ROLES } from './permissions.guard';

const OWNER_ROLES = new Set([
  ...ADMIN_ROLES,
  'Platform Admin',
  'platform-admin',
  'platform_admin',
]);

/**
 * Only an account owner or admin may accept legal and business risk on the
 * business's behalf (docs/markets.md s3.1). A role, not a permission: a
 * permission can be granted to anyone, and this decision belongs to the
 * people who own the risk.
 */
@Injectable()
export class OwnerRoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const roles: unknown = request.user?.roles;
    if (Array.isArray(roles) && roles.some((r) => OWNER_ROLES.has(r))) {
      return true;
    }
    throw new ForbiddenException(
      'Only an account owner or admin can accept legal risk for the business.',
    );
  }
}
