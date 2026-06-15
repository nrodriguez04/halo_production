import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  const buildContext = (user?: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows routes without permission requirements', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        buildContext({ roles: ['Agent'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('still allows admin roles without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        buildContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });
});
