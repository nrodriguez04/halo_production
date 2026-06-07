import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let getAllAndOverride: jest.Mock;

  const createContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext =>
    ({
      getHandler: () => PermissionsGuard,
      getClass: () => PermissionsGuard,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    getAllAndOverride = jest.fn();
    guard = new PermissionsGuard(
      { getAllAndOverride } as unknown as Reflector,
    );
  });

  it('allows routes with no required permissions', () => {
    getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(() =>
      guard.canActivate(
        createContext({ roles: ['Member'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows tenant admins without explicit permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        createContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows protected routes when all required permissions are present', () => {
    getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        createContext({
          roles: ['Member'],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
