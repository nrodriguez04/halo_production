import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

const makeContext = (user: {
  roles?: string[];
  permissions?: string[];
}): ExecutionContext =>
  ({
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as any;

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        makeContext({ roles: ['Member'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(makeContext({ roles: ['Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('allows requests that include the required permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Member'],
          permissions: ['control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
