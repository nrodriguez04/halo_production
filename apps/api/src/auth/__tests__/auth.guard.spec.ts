jest.mock('../descope.client', () => ({
  descope: {
    validateSession: jest.fn(),
  },
}));

import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '../auth.guard';
import { descope } from '../descope.client';

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    delete process.env.INTERNAL_API_TOKEN;
  });

  it('accepts the internal api token with forwarded tenant context', async () => {
    process.env.INTERNAL_API_TOKEN = 'internal-token';
    const guard = new AuthGuard();
    const request = {
      headers: {
        authorization: 'Bearer internal-token',
        'x-internal-account-id': 'tenant-1',
        'x-internal-actor': 'worker',
      },
    };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect((descope.validateSession as jest.Mock)).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      accountId: 'tenant-1',
      user: expect.objectContaining({
        accountId: 'tenant-1',
        actor: 'worker',
        permissions: [],
        roles: [],
      }),
    });
  });

  it('rejects internal requests without a forwarded tenant id', async () => {
    process.env.INTERNAL_API_TOKEN = 'internal-token';
    const guard = new AuthGuard();
    const request = {
      headers: {
        authorization: 'Bearer internal-token',
      },
    };

    await expect(guard.canActivate(makeContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('marks descope sessions as user actors', async () => {
    const guard = new AuthGuard();
    const request = {
      headers: {
        authorization: 'Bearer session-token',
      },
    };
    (descope.validateSession as jest.Mock).mockResolvedValue({
      userId: 'user-1',
      claims: {
        tenants: {
          'tenant-1': {
            permissions: ['control_plane:read'],
            roles: ['Member'],
          },
        },
      },
    });

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      accountId: 'tenant-1',
      user: expect.objectContaining({
        userId: 'user-1',
        accountId: 'tenant-1',
        actor: 'user',
      }),
    });
  });
});
