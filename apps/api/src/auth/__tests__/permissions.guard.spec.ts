import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let guard: PermissionsGuard;

  const buildContext = (user?: {
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

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('allows routes with no declared permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(buildContext())).toBe(true);
  });

  it('allows admin roles without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(buildContext({ roles: ['Tenant Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(() =>
      guard.canActivate(buildContext({ roles: ['Member'], permissions: [] })),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });

  it('allows protected routes when all required permissions are present', () => {
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

  it('denies protected routes when a required permission is missing', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(() =>
      guard.canActivate(
        buildContext({
          roles: ['Member'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(new ForbiddenException('Insufficient permissions'));
  });
});
