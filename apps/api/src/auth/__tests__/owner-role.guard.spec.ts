import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { OwnerRoleGuard } from '../owner-role.guard';

function ctx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('OwnerRoleGuard', () => {
  const guard = new OwnerRoleGuard();

  it('lets an account owner or admin accept risk', () => {
    for (const role of ['Tenant Admin', 'Owner', 'Platform Admin'])
      expect(guard.canActivate(ctx({ roles: [role] }))).toBe(true);
  });

  it('refuses a permission without the role', () => {
    expect(() =>
      guard.canActivate(
        ctx({ roles: ['Analyst'], permissions: ['compliance:approve'] }),
      ),
    ).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx(undefined))).toThrow(ForbiddenException);
  });
});
