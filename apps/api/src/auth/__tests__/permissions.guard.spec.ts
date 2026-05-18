import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

function makeContext(user?: { roles?: string[]; permissions?: string[] }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
    getHandler: () => PermissionsGuard,
    getClass: () => PermissionsGuard,
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
    reflector.getAllAndOverride.mockReturnValueOnce([]);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows admin-role tokens even without permission claims', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({ roles: ['Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('denies permissionless tokens by default on protected routes', () => {
    reflector.getAllAndOverride.mockReturnValueOnce(['control_plane:write']);

    expect(() =>
      guard.canActivate(makeContext({ roles: [], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows tokens that contain every required permission', () => {
    reflector.getAllAndOverride.mockReturnValueOnce([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        makeContext({
          roles: [],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });

  it('denies tokens missing any required permission', () => {
    reflector.getAllAndOverride.mockReturnValueOnce([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: [],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
