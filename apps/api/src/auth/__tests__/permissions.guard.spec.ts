import { ForbiddenException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;

  let guard: PermissionsGuard;

  const makeContext = (user?: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: () => 'handler',
      getClass: () => class TestController {},
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  beforeEach(() => {
    getAllAndOverride.mockReset();
    guard = new PermissionsGuard(reflector);
  });

  it('allows requests when no permissions are required', () => {
    getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows admin roles even without explicit permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('rejects authenticated users without permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: [],
        }),
      ),
    ).toThrow('Insufficient permissions');
  });

  it('allows users with every required permission', () => {
    getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
