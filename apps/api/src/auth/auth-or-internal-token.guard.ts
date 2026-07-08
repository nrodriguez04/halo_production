import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AuthGuard } from './auth.guard';

type InternalRequest = Request & {
  accountId?: string;
  userId?: string;
  authType?: 'internal';
  user?: {
    userId: null;
    accountId: string;
    permissions: string[];
    roles: string[];
    authType: 'internal';
  };
};

@Injectable()
export class AuthOrInternalTokenGuard implements CanActivate {
  constructor(private readonly authGuard: AuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<InternalRequest>();
    const token = extractBearerToken(request.headers.authorization);

    if (token && isInternalToken(token)) {
      const accountId = extractAccountIdHeader(request.headers['x-account-id']);
      if (!accountId) {
        throw new UnauthorizedException(
          'Missing x-account-id header for internal service token',
        );
      }

      request.accountId = accountId;
      request.userId = undefined;
      request.authType = 'internal';
      request.user = {
        userId: null,
        accountId,
        permissions: [],
        roles: ['internal-service'],
        authType: 'internal',
      };
      return true;
    }

    return this.authGuard.canActivate(context);
  }
}

function extractBearerToken(
  authHeader: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  if (!raw?.startsWith('Bearer ')) return null;
  return raw.slice(7);
}

function extractAccountIdHeader(
  headerValue: string | string[] | undefined,
): string | null {
  const raw = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function isInternalToken(token: string): boolean {
  const configured = process.env.INTERNAL_API_TOKEN;
  if (!configured) return false;

  const actual = Buffer.from(token);
  const expected = Buffer.from(configured);
  if (actual.length !== expected.length) return false;

  return timingSafeEqual(actual, expected);
}
