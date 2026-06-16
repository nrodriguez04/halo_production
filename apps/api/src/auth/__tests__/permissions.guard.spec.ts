import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const buildContext = (user: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext =>
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

  it('allows routes with no declared permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(
      guard.canActivate(
        buildContext({ roles: [], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('denies permissioned routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(() =>
      guard.canActivate(buildContext({ roles: [], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even when permission claims are empty', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        buildContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows users that hold every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        buildContext({
          roles: [],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
