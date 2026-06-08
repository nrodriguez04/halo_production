import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const makeContext = (user?: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  const makeReflector = (requiredPermissions: string[]) =>
    ({
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    }) as unknown as Reflector;

  it('allows unprotected routes without permission metadata', () => {
    const guard = new PermissionsGuard(makeReflector([]));

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    const guard = new PermissionsGuard(makeReflector(['control_plane:write']));

    expect(() =>
      guard.canActivate(makeContext({ permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows protected routes when all required permissions are present', () => {
    const guard = new PermissionsGuard(makeReflector(['control_plane:read']));

    expect(
      guard.canActivate(
        makeContext({ permissions: ['control_plane:read', 'leads:read'] }),
      ),
    ).toBe(true);
  });

  it('allows admin roles even when permission claims are absent', () => {
    const guard = new PermissionsGuard(makeReflector(['control_plane:write']));

    expect(
      guard.canActivate(makeContext({ roles: ['Tenant Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('denies protected routes when a required permission is missing', () => {
    const guard = new PermissionsGuard(
      makeReflector(['control_plane:read', 'control_plane:write']),
    );

    expect(() =>
      guard.canActivate(
        makeContext({ permissions: ['control_plane:read'] }),
      ),
    ).toThrow(ForbiddenException);
  });
});
