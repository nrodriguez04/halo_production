import { Request } from 'express';
import type { CostActor } from '../cost-control/dto/cost-intent.dto';

export const HALO_ACCOUNT_ID_HEADER = 'x-halo-account-id';

export interface InternalServiceContext {
  accountId: string;
  actor: CostActor;
}

export function resolveInternalServiceContext(
  request: Request,
  authenticatedAccountId: string,
): InternalServiceContext {
  const forwardedAccountId = normalizeHeaderValue(
    request.headers[HALO_ACCOUNT_ID_HEADER],
  );
  const bearerToken = extractBearerToken(request.headers.authorization);

  if (
    forwardedAccountId &&
    bearerToken &&
    process.env.INTERNAL_API_TOKEN &&
    bearerToken === process.env.INTERNAL_API_TOKEN
  ) {
    return { accountId: forwardedAccountId, actor: 'worker' };
  }

  return { accountId: authenticatedAccountId, actor: 'user' };
}

function extractBearerToken(header: string | string[] | undefined): string | null {
  const value = normalizeHeaderValue(header);
  if (!value?.startsWith('Bearer ')) {
    return null;
  }
  return value.slice(7);
}

function normalizeHeaderValue(
  value: string | string[] | undefined,
): string | null {
  const single = Array.isArray(value) ? value[0] : value;
  const trimmed = single?.trim();
  return trimmed ? trimmed : null;
}
