import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: PermissionsGuard;
  let request: { user?: { roles?: string[]; permissions?: string[] } };
  let context: ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
    request = {};
    context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  });

  it('denies protected routes when permission claims are missing', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);
    request.user = { roles: ['Member'], permissions: [] };

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows tenant admins even without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:read']);
    request.user = { roles: ['Tenant Admin'], permissions: [] };

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows users that have every required permission', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);
    request.user = {
      roles: ['Member'],
      permissions: ['control_plane:read', 'control_plane:write'],
    };

    expect(guard.canActivate(context)).toBe(true);
  });
});
