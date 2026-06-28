import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { descope } from './descope.client';

const INTERNAL_ACCOUNT_HEADER = 'x-internal-account-id';
const INTERNAL_ACTOR_HEADER = 'x-internal-actor';
const INTERNAL_USER_HEADER = 'x-internal-user-id';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const internalUser = this.authenticateInternalRequest(request, token);
    if (internalUser) {
      this.attachUser(request, internalUser);
      return true;
    }

    try {
      const session = await (descope as any).validateSession(token);
      const claims = this.getClaims(session);

      const userId =
        session?.userId ||
        claims?.sub ||
        claims?.userId ||
        claims?.uid ||
        undefined;

      const { accountId, permissions, roles } =
        this.extractTenantInfo(claims);

      if (!accountId) {
        this.logger.warn(
          'No tenant/account claim found in token. ' +
            `Available claim keys: [${Object.keys(claims).join(', ')}]`,
        );
        throw new ForbiddenException(
          'Session token does not contain a tenant/account claim',
        );
      }

      const user = {
        userId,
        accountId,
        permissions,
        roles,
        actor: 'user' as const,
        claims,
        session,
      };

      this.attachUser(request, user);
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid session token');
    }

    return true;
  }

  private authenticateInternalRequest(request: Request, token: string) {
    const internalToken = process.env.INTERNAL_API_TOKEN;
    if (!internalToken || token !== internalToken) {
      return null;
    }

    const accountId = this.readHeader(request, INTERNAL_ACCOUNT_HEADER);
    if (!accountId) {
      throw new ForbiddenException(
        'Internal token requires X-Internal-Account-Id',
      );
    }

    const actor = this.normalizeInternalActor(
      this.readHeader(request, INTERNAL_ACTOR_HEADER),
    );
    const userId = this.readHeader(request, INTERNAL_USER_HEADER);

    return {
      userId,
      accountId,
      permissions: [],
      roles: [],
      actor,
      claims: {},
      session: null,
    };
  }

  /**
   * Descope JWTs store tenant info as:
   *   "tenants": { "tenant-id": { "permissions": [...], "roles": [...] } }
   *
   * This method handles both the Descope nested format and flat claim
   * formats (tenantId, accountId, orgId) for forward compatibility.
   */
  private extractTenantInfo(claims: Record<string, any>): {
    accountId: string | undefined;
    permissions: string[];
    roles: string[];
  } {
    // Descope nested tenants object — primary path
    if (claims?.tenants && typeof claims.tenants === 'object') {
      const tenantIds = Object.keys(claims.tenants);
      if (tenantIds.length > 0) {
        const tenantId = tenantIds[0];
        const tenantData = claims.tenants[tenantId] || {};
        return {
          accountId: tenantId,
          permissions: this.normalizeStringArray(tenantData.permissions),
          roles: this.normalizeStringArray(tenantData.roles),
        };
      }
    }

    // Flat claim fallbacks (non-Descope providers or custom claims)
    const accountId =
      claims?.tenantId ||
      claims?.accountId ||
      claims?.orgId ||
      (Array.isArray(claims?.tenantIds) ? claims.tenantIds[0] : undefined) ||
      undefined;

    return {
      accountId,
      permissions: this.normalizeStringArray(
        claims?.permissions ?? claims?.perms ?? claims?.scp,
      ),
      roles: this.normalizeStringArray(claims?.roles),
    };
  }

  private getClaims(session: any): Record<string, any> {
    if (!session || typeof session !== 'object') return {};

    return (
      session.claims ||
      session.sessionClaims ||
      session.jwtClaims ||
      session.token ||
      {}
    );
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    if (typeof value === 'string') {
      return value.split(' ').filter(Boolean);
    }
    return [];
  }

  private normalizeInternalActor(value: string | undefined) {
    switch (value) {
      case 'user':
      case 'worker':
      case 'system':
        return value;
      default:
        return 'system';
    }
  }

  private readHeader(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return typeof value === 'string' ? value : undefined;
  }

  private attachUser(request: Request, user: Record<string, unknown>) {
    (request as any).user = user;
    (request as any).userId = user.userId;
    (request as any).accountId = user.accountId;
  }
}

