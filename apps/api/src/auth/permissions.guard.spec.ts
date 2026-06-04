import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const createContext = (user: { roles?: string[]; permissions?: string[] }) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: jest.fn(),
      getClass: jest.fn(),
    }) as unknown as ExecutionContext;

  const createGuard = (requiredPermissions: string[]) => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(requiredPermissions),
    } as unknown as Reflector;

    return new PermissionsGuard(reflector);
  };

  it('allows access when no permissions are required', () => {
    const guard = createGuard([]);

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('allows admin roles without explicit permissions', () => {
    const guard = createGuard(['control_plane:write']);

    expect(
      guard.canActivate(createContext({ roles: ['Tenant Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('rejects tokens with no permission claims on protected routes', () => {
    const guard = createGuard(['control_plane:write']);

    expect(() => guard.canActivate(createContext({ roles: [], permissions: [] }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects users missing a required permission', () => {
    const guard = createGuard(['control_plane:write']);

    expect(
      () =>
        guard.canActivate(
          createContext({
            roles: [],
            permissions: ['control_plane:read'],
          }),
        ),
    ).toThrow(ForbiddenException);
  });

  it('allows users with every required permission', () => {
    const guard = createGuard(['control_plane:read', 'control_plane:write']);

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
