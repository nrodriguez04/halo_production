import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { descope } from './descope.client';

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const authHeader = request.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
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

      const accountId =
        claims?.tenantId ||
        claims?.accountId ||
        claims?.orgId ||
        (Array.isArray(claims?.tenantIds) ? claims.tenantIds[0] : undefined) ||
        undefined;

      const permissions = this.normalizeStringArray(
        claims?.permissions ?? claims?.perms ?? claims?.scp,
      );
      const roles = this.normalizeStringArray(claims?.roles);

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
    } catch {
      throw new UnauthorizedException('Invalid session token');
    }

    return true;
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
}

