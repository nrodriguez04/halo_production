import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };

    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  const createContext = (
    user: { roles?: string[]; permissions?: string[] } = {},
  ) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  it('allows requests when no permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows admin roles without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        createContext({ roles: ['Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(createContext({ roles: [], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows requests with all required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:write',
      'control_plane:read',
    ]);

    expect(
      guard.canActivate(
        createContext({
          roles: [],
          permissions: ['control_plane:write', 'control_plane:read'],
        }),
      ),
    ).toBe(true);
  });
});
