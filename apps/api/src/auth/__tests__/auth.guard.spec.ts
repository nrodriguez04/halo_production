import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../auth.guard';
import { descope } from '../descope.client';

jest.mock('../descope.client', () => ({
  descope: {
    validateSession: jest.fn(),
  },
}));

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

describe('AuthGuard', () => {
  const validateSession = (descope as any).validateSession as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.INTERNAL_API_TOKEN = 'internal-secret';
  });

  afterEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
  });

  it('accepts internal service tokens with forwarded tenant context', async () => {
    const guard = new AuthGuard();
    const request: any = {
      headers: {
        authorization: 'Bearer internal-secret',
        'x-internal-account-id': 'tenant-1',
        'x-internal-actor': 'worker',
      },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(validateSession).not.toHaveBeenCalled();
    expect(request.user).toEqual(
      expect.objectContaining({
        accountId: 'tenant-1',
        actor: 'worker',
        userId: 'worker',
      }),
    );
  });

  it('rejects internal service tokens missing forwarded tenant context', async () => {
    const guard = new AuthGuard();
    const request: any = {
      headers: {
        authorization: 'Bearer internal-secret',
      },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException,
    );
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('falls back to session validation for user bearer tokens', async () => {
    const guard = new AuthGuard();
    const request: any = {
      headers: {
        authorization: 'Bearer user-session-token',
      },
    };

    validateSession.mockResolvedValue({
      userId: 'user-1',
      claims: {
        tenantId: 'tenant-1',
        permissions: ['control_plane:read'],
        roles: [],
      },
    });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(validateSession).toHaveBeenCalledWith('user-session-token');
    expect(request.user).toEqual(
      expect.objectContaining({
        accountId: 'tenant-1',
        userId: 'user-1',
        permissions: ['control_plane:read'],
      }),
    );
  });
});
