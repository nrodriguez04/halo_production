import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function makeContext(user: { roles?: string[]; permissions?: string[] } = {}) {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('PermissionsGuard', () => {
  let reflector: jest.Mocked<Reflector>;
  let guard: PermissionsGuard;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as any;
    guard = new PermissionsGuard(reflector);
    jest.spyOn((guard as any).logger, 'debug').mockImplementation(() => undefined);
  });

  it('allows handlers with no declared permissions', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(makeContext())).toBe(true);
  });

  it('denies protected routes when token has no permission claims', () => {
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

  it('allows admin roles to bypass explicit permission claims', () => {
    reflector.getAllAndOverride.mockReturnValue(['control_plane:write']);

    expect(
      guard.canActivate(
        makeContext({
          roles: ['Admin'],
          permissions: [],
        }),
      ),
    ).toBe(true);
  });
});
