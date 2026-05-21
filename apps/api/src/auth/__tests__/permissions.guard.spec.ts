import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

function createContext(user?: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => PermissionsGuard,
    getClass: () => PermissionsGuard,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;
    guard = new PermissionsGuard(reflector);
  });

  it('allows routes with no permission metadata', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows admin roles without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        createContext({
          roles: ['Tenant Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows users with every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        createContext({
          roles: ['Agent'],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(() =>
      guard.canActivate(
        createContext({
          roles: ['Agent'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects users missing one of the required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(() =>
      guard.canActivate(
        createContext({
          roles: ['Agent'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
