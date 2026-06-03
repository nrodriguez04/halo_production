import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  const makeContext = (user?: {
    roles?: string[];
    permissions?: string[];
  }) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector.getAllAndOverride.mockReset();
  });

  it('allows routes without required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const guard = new PermissionsGuard(reflector as any);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('allows admin roles even without explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);
    const guard = new PermissionsGuard(reflector as any);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Tenant Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });

  it('denies access when the token has no permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);
    const guard = new PermissionsGuard(reflector as any);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: [],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows users with all required permissions', () => {
    reflector.getAllAndOverride.mockReturnValue([
      'control_plane:write',
      'control_plane:read',
    ]);
    const guard = new PermissionsGuard(reflector as any);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: ['control_plane:write', 'control_plane:read'],
        }),
      ),
    ).toBe(true);
  });

  it('denies users missing any required permission', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);
    const guard = new PermissionsGuard(reflector as any);

    expect(() =>
      guard.canActivate(
        makeContext({
          roles: ['User'],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
