import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';

const mockValidateSession = jest.fn();

jest.mock('../descope.client', () => ({
  descope: {
    validateSession: mockValidateSession,
  },
}));

import { AuthGuard } from '../auth.guard';

describe('AuthGuard', () => {
  const originalInternalToken = process.env.INTERNAL_API_TOKEN;

  const createContext = (headers: Record<string, string | undefined>) => {
    const request: any = { headers };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;

    return { context, request };
  };

  beforeEach(() => {
    mockValidateSession.mockReset();
    process.env.INTERNAL_API_TOKEN = 'internal-secret';
  });

  afterAll(() => {
    if (originalInternalToken === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
      return;
    }
    process.env.INTERNAL_API_TOKEN = originalInternalToken;
  });

  it('accepts internal worker tokens with forwarded tenant context', async () => {
    const guard = new AuthGuard();
    const { context, request } = createContext({
      authorization: 'Bearer internal-secret',
      'x-internal-account-id': 'tenant-1',
      'x-internal-actor': 'worker',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockValidateSession).not.toHaveBeenCalled();
    expect(request.accountId).toBe('tenant-1');
    expect(request.actor).toBe('worker');
    expect(request.user).toMatchObject({
      accountId: 'tenant-1',
      actor: 'worker',
      isInternal: true,
    });
  });

  it('rejects internal tokens missing the forwarded tenant header', async () => {
    const guard = new AuthGuard();
    const { context } = createContext({
      authorization: 'Bearer internal-secret',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('continues to validate Descope bearer tokens for normal users', async () => {
    mockValidateSession.mockResolvedValue({
      userId: 'user-1',
      claims: {
        tenants: {
          'tenant-1': {
            permissions: ['control_plane:read'],
            roles: ['member'],
          },
        },
      },
    });

    const guard = new AuthGuard();
    const { context, request } = createContext({
      authorization: 'Bearer descope-token',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(mockValidateSession).toHaveBeenCalledWith('descope-token');
    expect(request.user).toMatchObject({
      userId: 'user-1',
      accountId: 'tenant-1',
      permissions: ['control_plane:read'],
      roles: ['member'],
      actor: 'user',
    });
  });

  it('rejects invalid bearer tokens', async () => {
    mockValidateSession.mockRejectedValue(new Error('invalid'));

    const guard = new AuthGuard();
    const { context } = createContext({
      authorization: 'Bearer bad-token',
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
