import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;

  const makeContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }): ExecutionContext =>
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

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['Member'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles without explicit permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows callers that present every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);

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
