import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  function makeContext(user: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  }

  function makeReflector(requiredPermissions: string[]): Reflector {
    return {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    } as unknown as Reflector;
  }

  it('denies protected routes when the token has no permission claims', () => {
    const guard = new PermissionsGuard(
      makeReflector(['control_plane:read']),
    );

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: [],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even without explicit permissions', () => {
    const guard = new PermissionsGuard(
      makeReflector(['control_plane:read']),
    );

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows users that carry the required permission claims', () => {
    const guard = new PermissionsGuard(
      makeReflector(['control_plane:write']),
    );

    expect(
      guard.canActivate(
        makeContext({
          roles: [],
          permissions: ['control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
