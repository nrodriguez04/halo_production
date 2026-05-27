import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

type RequestUser = {
  roles?: string[];
  permissions?: string[];
};

function createContext(user: RequestUser): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;
  const guard = new PermissionsGuard(reflector);

  beforeEach(() => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      'control_plane:read',
    ]);
  });

  it('allows explicit admin roles without permission claims', () => {
    const context = createContext({ roles: ['Tenant Admin'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies protected routes when the token has no permission claims', () => {
    const context = createContext({ roles: [], permissions: [] });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows users that hold every required permission', () => {
    const context = createContext({
      roles: [],
      permissions: ['control_plane:read', 'control_plane:write'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
