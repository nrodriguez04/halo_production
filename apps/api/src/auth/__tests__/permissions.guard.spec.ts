import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from '../permissions.guard';

describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['control_plane:write']),
    };
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  it('denies permission-gated routes when the token has no permission claims', () => {
    expect(() =>
      guard.canActivate(
        makeContext({ roles: ['Member'], permissions: [] }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows seeded owner roles even when permission claims are absent', () => {
    expect(
      guard.canActivate(makeContext({ roles: ['OWNER'], permissions: [] })),
    ).toBe(true);
  });

  it('allows requests that carry every required permission', () => {
    expect(
      guard.canActivate(
        makeContext({
          roles: ['Member'],
          permissions: ['control_plane:write'],
        }),
      ),
    ).toBe(true);
  });
});

function makeContext(user: {
  roles?: string[];
  permissions?: string[];
}): ExecutionContext {
  return {
    getHandler: () => jest.fn(),
    getClass: () => class TestController {},
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as ExecutionContext;
}
