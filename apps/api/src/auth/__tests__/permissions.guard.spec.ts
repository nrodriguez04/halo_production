import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const getAllAndOverride = jest.fn();
  const reflector = {
    getAllAndOverride,
  } as unknown as Reflector;

  const guard = new PermissionsGuard(reflector);

  const makeContext = (user: { roles?: string[]; permissions?: string[] }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as any;

  beforeEach(() => {
    getAllAndOverride.mockReset();
  });

  it('denies protected routes when the token has no permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(() =>
      guard.canActivate(
        makeContext({ roles: ['Member'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even without explicit permission claims', () => {
    getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows users that hold the required permission', () => {
    getAllAndOverride.mockReturnValue(['control_plane:read']);

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
