import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  class TestController {}

  const handler = () => undefined;
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  const createContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }) =>
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

  it('allows requests with no declared permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('denies protected routes when permission claims are missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() => guard.canActivate(createContext({ roles: ['Member'] }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows admin roles without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(guard.canActivate(createContext({ roles: ['Admin'] }))).toBe(true);
  });

  it('allows users that carry every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        createContext({
          roles: ['Member'],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });

  it('denies users missing one of the required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(() =>
      guard.canActivate(
        createContext({
          roles: ['Member'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
