import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';

/**
 * Authenticates service-to-service calls from the worker.
 *
 * The worker has no Descope session, so it cannot pass `AuthGuard`. It
 * presents `INTERNAL_API_TOKEN` as a bearer token plus an explicit
 * `x-halo-account-id` header naming the tenant the work belongs to.
 *
 * Fails closed: if `INTERNAL_API_TOKEN` is unset or too short to be a
 * credible secret, every internal route is refused rather than opened.
 *
 * Routes behind this guard must NOT be reachable from the public internet —
 * the bearer token is the only thing protecting them, and the caller
 * chooses its own tenant. Bind them to the internal network (see the
 * `/api/internal` block in the deployment runbook).
 */
const MIN_TOKEN_LENGTH = 32;
const ACCOUNT_HEADER = 'x-halo-account-id';

@Injectable()
export class InternalAuthGuard implements CanActivate {
  private readonly logger = new Logger(InternalAuthGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const configured = process.env.INTERNAL_API_TOKEN;
    if (!configured || configured.length < MIN_TOKEN_LENGTH) {
      this.logger.warn(
        `Internal API called but INTERNAL_API_TOKEN is ${
          configured ? `shorter than ${MIN_TOKEN_LENGTH} chars` : 'not set'
        }; refusing.`,
      );
      throw new ForbiddenException('Internal API is not configured');
    }

    const header = request.headers.authorization;
    const presented = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!presented) {
      throw new UnauthorizedException('Missing internal bearer token');
    }

    const a = Buffer.from(presented, 'utf-8');
    const b = Buffer.from(configured, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid internal token');
    }

    const accountId = request.headers[ACCOUNT_HEADER];
    if (typeof accountId !== 'string' || !accountId.trim()) {
      throw new ForbiddenException(
        `Internal calls must name a tenant via the ${ACCOUNT_HEADER} header`,
      );
    }

    // Mirrors what AuthGuard attaches, so @CurrentAccountId and the
    // CostContext builders behave identically on internal routes.
    const user = {
      userId: 'internal-worker',
      accountId: accountId.trim(),
      permissions: [],
      roles: [],
      claims: { internal: true },
      session: null,
    };
    (request as any).user = user;
    (request as any).userId = user.userId;
    (request as any).accountId = user.accountId;

    return true;
  }
}
