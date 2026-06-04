import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const createContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows requests when no permissions are required', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('denies tokens with no permission claims on protected routes', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(createContext({ roles: ['Member'], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles even if permission claims are missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        createContext({ roles: ['Tenant Admin'], permissions: [] }),
      ),
    ).toBe(true);
  });

  it('allows users with every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        createContext({
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
