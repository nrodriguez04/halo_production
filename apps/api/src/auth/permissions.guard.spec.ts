import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function makeContext(user: {
  roles?: string[];
  permissions?: string[];
} = {}): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows requests when no permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows admin roles even when the token has no explicit permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Tenant Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['Agent'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows users that have every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        makeContext({
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
