import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthOrInternalTokenGuard } from '../auth-or-internal-token.guard';

describe('AuthOrInternalTokenGuard', () => {
  const originalToken = process.env.INTERNAL_API_TOKEN;

  afterEach(() => {
    process.env.INTERNAL_API_TOKEN = originalToken;
    jest.restoreAllMocks();
  });

  it('accepts the internal token and populates request account context', async () => {
    process.env.INTERNAL_API_TOKEN = 'shared-secret';
    const fallbackAuthGuard = { canActivate: jest.fn() } as any;
    const guard = new AuthOrInternalTokenGuard(fallbackAuthGuard);
    const request: any = {
      headers: {
        authorization: 'Bearer shared-secret',
        'x-account-id': 'acc_1',
      },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(fallbackAuthGuard.canActivate).not.toHaveBeenCalled();
    expect(request.accountId).toBe('acc_1');
    expect(request.authType).toBe('internal');
    expect(request.user).toEqual(
      expect.objectContaining({
        accountId: 'acc_1',
        authType: 'internal',
      }),
    );
  });

  it('rejects internal-token requests that omit the tenant header', async () => {
    process.env.INTERNAL_API_TOKEN = 'shared-secret';
    const guard = new AuthOrInternalTokenGuard({ canActivate: jest.fn() } as any);
    const request: any = {
      headers: {
        authorization: 'Bearer shared-secret',
      },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('falls back to the standard auth guard for user sessions', async () => {
    process.env.INTERNAL_API_TOKEN = 'shared-secret';
    const fallbackAuthGuard = { canActivate: jest.fn().mockResolvedValue(true) } as any;
    const guard = new AuthOrInternalTokenGuard(fallbackAuthGuard);
    const request: any = {
      headers: {
        authorization: 'Bearer user-session-token',
      },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(fallbackAuthGuard.canActivate).toHaveBeenCalledTimes(1);
  });
});

function makeContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}
