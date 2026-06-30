import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  const createContext = (user: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:read']),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('denies protected routes when permission claims are empty', () => {
    expect(() =>
      guard.canActivate(
        createContext({ permissions: [], roles: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows admin roles without explicit permissions', () => {
    expect(
      guard.canActivate(
        createContext({ permissions: [], roles: ['Tenant Admin'] }),
      ),
    ).toBe(true);
  });

  it('allows users with the required permission', () => {
    expect(
      guard.canActivate(
        createContext({
          permissions: ['control_plane:read'],
          roles: [],
        }),
      ),
    ).toBe(true);
  });
});
