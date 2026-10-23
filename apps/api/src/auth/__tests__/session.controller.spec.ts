import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SessionController } from '../session.controller';
import { AuthGuard } from '../auth.guard';

describe('SessionController', () => {
  const controller = new SessionController();

  it('reports the account, roles and tenants the API resolved, and nothing else', () => {
    const out = controller.session({
      userId: 'U1',
      accountId: 'halo-hq',
      roles: ['Tenant Admin'],
      permissions: ['deals:approve'],
      claims: {
        exp: 1_800_000_000,
        email: 'someone@example.test',
        tenants: { 'halo-hq': { roles: ['Tenant Admin'] } },
      },
    });
    expect(out).toEqual({
      accountId: 'halo-hq',
      userId: 'U1',
      roles: ['Tenant Admin'],
      permissions: ['deals:approve'],
      admin: true,
      tenants: ['halo-hq'],
      expiresAt: new Date(1_800_000_000 * 1000).toISOString(),
      devBypass: false,
    });
    expect(JSON.stringify(out)).not.toContain('someone@example.test');
  });

  it('says when the dev auth bypass answered', () => {
    expect(
      controller.session({
        accountId: 'halo-hq',
        roles: [],
        claims: { devBypass: true },
      }),
    ).toEqual(
      expect.objectContaining({
        devBypass: true,
        admin: false,
        expiresAt: null,
      }),
    );
  });

  it('sits behind the auth guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SessionController)).toContain(
      AuthGuard,
    );
  });
});
