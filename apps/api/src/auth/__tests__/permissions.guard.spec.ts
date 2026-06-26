import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

function makeContext(user: {
  roles?: string[];
  permissions?: string[];
}): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      'control_plane:read',
    ]);
  });

  it('denies protected routes when permission claims are missing', () => {
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(makeContext({ roles: [], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows explicit permission claims on protected routes', () => {
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({
          roles: [],
          permissions: ['control_plane:read'],
        }),
      ),
    ).toBe(true);
  });

  it('still allows admin roles without explicit permission claims', () => {
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Tenant Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });
});
