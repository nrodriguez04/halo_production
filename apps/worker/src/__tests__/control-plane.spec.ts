const findUnique = jest.fn();
jest.mock('../prisma-client', () => ({
  prisma: { controlPlane: { findUnique } },
}));

import { getControlPlane } from '../control-plane';

const row = (accountId: string, over: Record<string, unknown> = {}) => ({
  accountId,
  enabled: true,
  smsEnabled: true,
  emailEnabled: true,
  docusignEnabled: true,
  externalDataEnabled: true,
  aiEnabled: true,
  aiDailyCostCap: 2,
  apiDailyCostCap: 50,
  ...over,
});

const stub = (tenant: any, global: any = null) =>
  findUnique.mockImplementation(async ({ where }: any) =>
    where.accountId === 'GLOBAL' ? global : tenant,
  );

describe('worker control plane', () => {
  beforeEach(() => {
    findUnique.mockReset();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('fails closed', () => {
    // A kill switch whose state cannot be read must stop work, not permit it.
    it('disables everything when the lookup throws', async () => {
      findUnique.mockRejectedValue(new Error('connection lost'));
      const cp = await getControlPlane('tenant-a');
      expect(cp.enabled).toBe(false);
      expect(cp.smsEnabled).toBe(false);
      expect(cp.aiDailyCostCap).toBe(0);
    });

    it('disables everything when the tenant has no row', async () => {
      stub(null);
      const cp = await getControlPlane('tenant-a');
      expect(cp.enabled).toBe(false);
    });

    it('disables everything when no tenant is supplied', async () => {
      const cp = await getControlPlane('');
      expect(cp.enabled).toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('tenant scoping', () => {
    it('returns the tenant row when no GLOBAL row exists', async () => {
      stub(row('tenant-a', { smsEnabled: false }));
      const cp = await getControlPlane('tenant-a');
      expect(cp.enabled).toBe(true);
      expect(cp.smsEnabled).toBe(false);
    });

    it('one tenant being disabled does not affect another', async () => {
      stub(row('tenant-b', { enabled: true }));
      expect((await getControlPlane('tenant-b')).enabled).toBe(true);
      expect(findUnique).toHaveBeenCalledWith({ where: { accountId: 'tenant-b' } });
    });
  });

  describe('GLOBAL master switch', () => {
    it('restricts the tenant', async () => {
      stub(row('tenant-a'), row('GLOBAL', { enabled: false }));
      expect((await getControlPlane('tenant-a')).enabled).toBe(false);
    });

    it('never grants more than the tenant allows', async () => {
      stub(row('tenant-a', { emailEnabled: false }), row('GLOBAL', { emailEnabled: true }));
      expect((await getControlPlane('tenant-a')).emailEnabled).toBe(false);
    });

    it('uses the lower cap', async () => {
      stub(row('tenant-a', { aiDailyCostCap: 2 }), row('GLOBAL', { aiDailyCostCap: 0.25 }));
      expect((await getControlPlane('tenant-a')).aiDailyCostCap).toBe(0.25);
    });
  });
});
