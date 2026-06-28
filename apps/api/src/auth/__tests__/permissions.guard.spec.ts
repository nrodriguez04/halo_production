import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

function makeContext(user: { roles?: string[]; permissions?: string[] }): ExecutionContext {
  return {
    getHandler: () => 'handler',
    getClass: () => 'controller',
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('denies protected routes when permission claims are empty', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(
        makeContext({ roles: ['Member'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles without explicit permission claims', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({ roles: ['Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows callers with the required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:read']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Member'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toBe(true);
  });
});
