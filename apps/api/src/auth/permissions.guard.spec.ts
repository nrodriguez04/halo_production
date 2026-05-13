import { ForbiddenException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn<string[] | undefined, [string, unknown[]]>(),
  } as unknown as Reflector;

  const guard = new PermissionsGuard(reflector);

  const createContext = (user: { roles?: string[]; permissions?: string[] } = {}) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('allows unprotected routes', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([]);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows admin roles without explicit permissions', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      'control_plane:read',
    ]);

    expect(
      guard.canActivate(createContext({ roles: ['Admin'], permissions: [] })),
    ).toBe(true);
  });

  it('denies protected routes when permission claims are missing', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      'control_plane:read',
    ]);

    expect(() =>
      guard.canActivate(createContext({ roles: [], permissions: [] })),
    ).toThrow(ForbiddenException);
  });

  it('allows protected routes when all required permissions are present', () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue([
      'control_plane:read',
      'control_plane:write',
    ]);

    expect(
      guard.canActivate(
        createContext({
          roles: [],
          permissions: ['control_plane:read', 'control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});
