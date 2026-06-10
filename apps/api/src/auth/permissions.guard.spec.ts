import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const makeContext = (user: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as ExecutionContext;

  it('allows requests when no permissions are required', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue([]),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(makeContext({ permissions: [] }))).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(makeContext({ permissions: [], roles: [] })),
    ).toThrow(ForbiddenException);
  });

  it('still allows admin roles without explicit permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(makeContext({ permissions: [], roles: ['Tenant Admin'] })),
    ).toBe(true);
  });

  it('allows users that have every required permission', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue(['control_plane:read', 'control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({
          permissions: ['control_plane:read', 'control_plane:write'],
          roles: [],
        }),
      ),
    ).toBe(true);
  });
});
