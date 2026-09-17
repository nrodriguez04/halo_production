// The dev auth bypass disables authentication outright, so the condition that
// gates it is security-critical. These tests exist to make any loosening of
// that condition fail loudly.

const ORIGINAL_ENV = process.env;

const loadFresh = () => {
  let mod: typeof import('../dev-bypass');
  jest.isolateModules(() => {
    // Deliberate: the module reads env at import time, so each permutation
    // needs a fresh copy.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('../dev-bypass');
  });
  return mod!;
};

describe('dev auth bypass gate', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('production can never be bypassed', () => {
    it.each(['true', 'false', 'TRUE', '1', 'yes', undefined])(
      'stays disabled in production with HALO_DEV_AUTH_BYPASS=%s',
      (flag) => {
        process.env.NODE_ENV = 'production';
        if (flag === undefined) delete process.env.HALO_DEV_AUTH_BYPASS;
        else process.env.HALO_DEV_AUTH_BYPASS = flag;

        expect(loadFresh().isDevAuthBypassEnabled()).toBe(false);
      },
    );
  });

  describe('outside production it is strictly opt-in', () => {
    it('is disabled when the flag is absent', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.HALO_DEV_AUTH_BYPASS;
      expect(loadFresh().isDevAuthBypassEnabled()).toBe(false);
    });

    it.each(['false', '1', 'yes', 'TRUE', ''])(
      'is disabled for the non-exact value %p',
      (flag) => {
        process.env.NODE_ENV = 'development';
        process.env.HALO_DEV_AUTH_BYPASS = flag;
        expect(loadFresh().isDevAuthBypassEnabled()).toBe(false);
      },
    );

    it('is enabled only for the exact string "true"', () => {
      process.env.NODE_ENV = 'development';
      process.env.HALO_DEV_AUTH_BYPASS = 'true';
      expect(loadFresh().isDevAuthBypassEnabled()).toBe(true);
    });
  });

  describe('bypassed identity', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'development';
      process.env.HALO_DEV_AUTH_BYPASS = 'true';
    });

    it('defaults to the seeded halo-hq tenant', () => {
      delete process.env.HALO_DEV_BYPASS_ACCOUNT_ID;
      expect(loadFresh().devBypassUser().accountId).toBe('halo-hq');
    });

    it('honours an overridden tenant', () => {
      process.env.HALO_DEV_BYPASS_ACCOUNT_ID = 'other-tenant';
      expect(loadFresh().devBypassUser().accountId).toBe('other-tenant');
    });

    it('carries an admin role so permission-gated routes resolve', () => {
      // PermissionsGuard short-circuits on ADMIN_ROLES.
      expect(loadFresh().devBypassUser().roles).toContain('Tenant Admin');
    });
  });
});
