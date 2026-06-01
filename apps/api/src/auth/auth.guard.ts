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

    const internalToken = process.env.INTERNAL_API_TOKEN;
    if (internalToken && token === internalToken) {
      const accountId = this.readHeader(request.headers['x-internal-account-id']);
      if (!accountId) {
        throw new ForbiddenException(
          'Internal service token requires x-internal-account-id',
        );
      }
      const actorHeader = this.readHeader(request.headers['x-internal-actor']);
      const actor = actorHeader === 'worker' ? 'worker' : 'system';
      (request as any).user = {
        userId: undefined,
        accountId,
        permissions: [],
        roles: [],
        claims: {},
        session: null,
        internal: true,
      };
      (request as any).userId = undefined;
      (request as any).accountId = accountId;
      (request as any).authActor = actor;
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
        claims,
        session,
      };

      (request as any).user = user;
      (request as any).userId = userId;
      (request as any).accountId = accountId;
      (request as any).authActor = 'user';
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      if (err instanceof UnauthorizedException) throw err;
      throw new UnauthorizedException('Invalid session token');
    }

    return true;
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

  private readHeader(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value;
  }
}

