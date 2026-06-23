import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

jest.mock('../descope.client', () => ({
  descope: {
    validateSession: jest.fn(),
  },
}));

import { descope } from '../descope.client';
import { AuthGuard } from '../auth.guard';

describe('AuthGuard', () => {
  const validateSession = (descope as any).validateSession as jest.Mock;
  const createContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    delete process.env.INTERNAL_API_TOKEN;
    validateSession.mockReset();
  });

  it('accepts internal service tokens with forwarded tenant context', async () => {
    process.env.INTERNAL_API_TOKEN = 'shared-secret';
    const request = {
      headers: {
        authorization: 'Bearer shared-secret',
        'x-internal-account-id': 'tenant-1',
        'x-internal-actor': 'worker',
      },
    };

    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect((request as any).accountId).toBe('tenant-1');
    expect((request as any).user.actor).toBe('worker');
    expect(validateSession).not.toHaveBeenCalled();
  });

  it('rejects internal service tokens that omit the forwarded tenant header', async () => {
    process.env.INTERNAL_API_TOKEN = 'shared-secret';
    const request = {
      headers: {
        authorization: 'Bearer shared-secret',
      },
    };

    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('still validates regular bearer tokens through Descope', async () => {
    validateSession.mockResolvedValue({
      userId: 'user-1',
      claims: {
        accountId: 'tenant-1',
        permissions: ['control_plane:read'],
        roles: [],
      },
    });
    const request = {
      headers: {
        authorization: 'Bearer real-user-token',
      },
    };

    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(validateSession).toHaveBeenCalledWith('real-user-token');
    expect((request as any).user.actor).toBe('user');
    expect((request as any).accountId).toBe('tenant-1');
  });

  it('rejects invalid external bearer tokens', async () => {
    validateSession.mockRejectedValue(new Error('bad token'));
    const request = {
      headers: {
        authorization: 'Bearer bad-token',
      },
    };

    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext(request))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
