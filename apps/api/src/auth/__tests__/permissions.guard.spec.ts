import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const handler = () => undefined;
  class TestController {}

  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let guard: PermissionsGuard;

  const buildContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => TestController,
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

  it('allows requests without permission metadata', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows tenant admins even when permission claims are absent', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(buildContext({ roles: ['Tenant Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('denies non-admin users when permission claims are absent', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(buildContext({ roles: ['Member'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('denies non-admin users missing a required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        buildContext({
          roles: ['Member'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows users with every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        buildContext({
          roles: ['Member'],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
