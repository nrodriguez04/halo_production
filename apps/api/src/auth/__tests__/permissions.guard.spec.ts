import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const makeContext = (user: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  it('allows access when no permissions are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([]),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(makeContext({}))).toBe(true);
  });

  it('denies permission-protected routes when the token has no permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(makeContext({ permissions: [] }))).toThrow(
      ForbiddenException,
    );
  });

  it('still allows admin-role tokens without explicit permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(makeContext({ roles: ['Tenant Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('allows tokens that contain the required permissions', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({ permissions: ['control_plane:read', 'control_plane:write'] }),
      ),
    ).toBe(true);
  });
});
