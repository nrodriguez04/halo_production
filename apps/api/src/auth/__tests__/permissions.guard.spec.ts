import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  const makeContext = (user?: { permissions?: string[]; roles?: string[] }) =>
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

  it('allows routes without required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(
      guard.canActivate(
        makeContext({ permissions: [], roles: ['User'] }),
      ),
    ).toBe(true);
  });

  it('denies non-admin users when permission claims are missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        makeContext({ permissions: [], roles: ['User'] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({ permissions: [], roles: ['Tenant Admin'] }),
      ),
    ).toBe(true);
  });

  it('allows users who have every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        makeContext({
          permissions: ['control_plane:read', 'control_plane:write'],
          roles: ['User'],
        }),
      ),
    ).toBe(true);
  });
});
