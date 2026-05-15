import { resolveInternalServiceContext } from '../internal-service-context';

describe('resolveInternalServiceContext', () => {
  it('uses the forwarded tenant for matching internal service tokens', () => {
    expect(
      resolveInternalServiceContext({
        currentAccountId: 'token-account',
        currentUserId: 'user-1',
        authorizationHeader: 'Bearer internal-token',
        requestedAccountId: 'lead-account',
        internalToken: 'internal-token',
        internalActor: 'worker',
      }),
    ).toEqual({
      accountId: 'lead-account',
      actor: 'worker',
    });
  });

  it('ignores forwarded tenants for normal user requests', () => {
    expect(
      resolveInternalServiceContext({
        currentAccountId: 'user-account',
        currentUserId: 'user-1',
        authorizationHeader: 'Bearer user-token',
        requestedAccountId: 'other-account',
        internalToken: 'internal-token',
        internalActor: 'worker',
      }),
    ).toEqual({
      accountId: 'user-account',
      actor: 'user',
      userId: 'user-1',
    });
  });

  it('falls back to the token tenant when no forwarded tenant is present', () => {
    expect(
      resolveInternalServiceContext({
        currentAccountId: 'token-account',
        authorizationHeader: 'Bearer internal-token',
        internalToken: 'internal-token',
        internalActor: 'worker',
      }),
    ).toEqual({
      accountId: 'token-account',
      actor: 'worker',
    });
  });
});
