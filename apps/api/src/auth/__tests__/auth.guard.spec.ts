import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

const validateSession = jest.fn();
jest.mock('../descope.client', () => ({ descope: { validateSession } }));

import { AuthGuard } from '../auth.guard';

function context(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const guard = new AuthGuard();
  const env = { ...process.env };

  beforeEach(() => {
    validateSession.mockReset();
    validateSession.mockResolvedValue({
      token: {
        sub: 'U1',
        tenants: { 'halo-hq': { roles: ['Tenant Admin'], permissions: [] } },
      },
    });
    process.env.CORS_ORIGINS = 'https://app.example.com';
    delete process.env.HALO_DEV_AUTH_BYPASS;
  });
  afterAll(() => {
    process.env = env;
  });

  it("accepts Descope's session cookie when tokens are managed in cookies", async () => {
    const request: Record<string, any> = {
      method: 'POST',
      headers: {
        cookie: 'DSR=refresh; DS=session-jwt',
        origin: 'https://app.example.com',
      },
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(validateSession).toHaveBeenCalledWith('session-jwt');
    expect(request.accountId).toBe('halo-hq');
    expect(request.userId).toBe('U1');
  });

  it('refuses a cookie-only write from another site without asking Descope', async () => {
    const request = {
      method: 'POST',
      headers: { cookie: 'DS=session-jwt', origin: 'https://evil.example.net' },
    };
    await expect(guard.canActivate(context(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('still takes the bearer header first', async () => {
    const request = {
      method: 'GET',
      headers: { authorization: 'Bearer header-jwt', cookie: 'DS=cookie-jwt' },
    };
    await guard.canActivate(context(request));
    expect(validateSession).toHaveBeenCalledWith('header-jwt');
  });

  it('falls back to the session cookie when a stale header token is refused', async () => {
    validateSession.mockImplementation(async (token: string) => {
      if (token === 'stale-header-jwt') throw new Error('JWT expired');
      return {
        token: {
          sub: 'U1',
          tenants: { 'halo-hq': { roles: ['Tenant Admin'], permissions: [] } },
        },
      };
    });
    const request: Record<string, any> = {
      method: 'GET',
      headers: {
        authorization: 'Bearer stale-header-jwt',
        cookie: 'DS=current-cookie-jwt',
      },
    };
    await expect(guard.canActivate(context(request))).resolves.toBe(true);
    expect(validateSession.mock.calls.map((c) => c[0])).toEqual([
      'stale-header-jwt',
      'current-cookie-jwt',
    ]);
    expect(request.accountId).toBe('halo-hq');
  });

  it('refuses when every token is refused', async () => {
    validateSession.mockRejectedValue(new Error('JWT expired'));
    await expect(
      guard.canActivate(
        context({
          method: 'GET',
          headers: { authorization: 'Bearer old', cookie: 'DS=also-old' },
        }),
      ),
    ).rejects.toThrow('Invalid session token');
    expect(validateSession).toHaveBeenCalledTimes(2);
  });

  it('refuses a request with neither', async () => {
    await expect(
      guard.canActivate(context({ method: 'GET', headers: {} })),
    ).rejects.toThrow('Missing session token');
  });
});
