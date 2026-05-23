import type { CostActor } from '../cost-control/dto/cost-intent.dto';

export interface InternalServiceContext {
  accountId: string;
  actor: CostActor;
  userId?: string;
}

interface ResolveInternalServiceContextParams {
  currentAccountId: string;
  currentUserId?: string;
  authorizationHeader?: string;
  requestedAccountId?: string;
  internalToken?: string;
  internalActor?: Exclude<CostActor, 'user'>;
}

// Internal worker/service requests authenticate with a single bearer token,
// so they must forward the true tenant explicitly on each request.
export function resolveInternalServiceContext(
  params: ResolveInternalServiceContextParams,
): InternalServiceContext {
  const bearerToken = extractBearerToken(params.authorizationHeader);
  const requestedAccountId = params.requestedAccountId?.trim();

  if (params.internalToken && bearerToken === params.internalToken) {
    return {
      accountId: requestedAccountId || params.currentAccountId,
      actor: params.internalActor ?? 'system',
    };
  }

  return {
    accountId: params.currentAccountId,
    actor: 'user',
    ...(params.currentUserId ? { userId: params.currentUserId } : {}),
  };
}

function extractBearerToken(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}
