import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const buildContext = (user: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows unprotected routes without permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(buildContext({}))).toBe(true);
  });

  it('denies protected routes when the token omits permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(() =>
      guard.canActivate(buildContext({ roles: ['Member'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('still allows tenant admins without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(
      guard.canActivate(
        buildContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows users with the required permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        buildContext({ permissions: ['control_plane:write'] }),
      ),
    ).toBe(true);
  });
});
