import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator';

const ADMIN_ROLES = ['Tenant Admin', 'Admin', 'admin', 'Owner', 'owner'];

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const userRoles = (request.user?.roles as string[]) ?? [];
    const userPermissions = (request.user?.permissions as string[]) ?? [];

    if (userRoles.some((role) => ADMIN_ROLES.includes(role))) {
      return true;
    }

    // A token with no permission claims used to be granted EVERY permission,
    // which left control-plane and chaos/DLQ routes effectively open. Deny by
    // default instead. Set HALO_ALLOW_EMPTY_PERMISSION_CLAIMS=true to restore
    // the old behaviour while identity-provider claims are still being wired
    // up — it is refused outright in production.
    if (userPermissions.length === 0) {
      const allowEmpty =
        process.env.NODE_ENV !== 'production' &&
        process.env.HALO_ALLOW_EMPTY_PERMISSION_CLAIMS === 'true';

      if (allowEmpty) {
        this.logger.warn(
          `Token carries no permission claims; allowing ${requiredPermissions.join(', ')} ` +
            'because HALO_ALLOW_EMPTY_PERMISSION_CLAIMS is set (development only).',
        );
        return true;
      }

      throw new ForbiddenException('Insufficient permissions');
    }

    const hasAll = requiredPermissions.every((perm) =>
      userPermissions.includes(perm),
    );

    if (!hasAll) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
