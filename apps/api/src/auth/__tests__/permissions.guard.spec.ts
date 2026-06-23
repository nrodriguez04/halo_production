import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const createContext = (user: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('denies permission-gated routes when the token has no permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(
        createContext({ roles: [], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('still allows tenant admins without explicit permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        createContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });
});
