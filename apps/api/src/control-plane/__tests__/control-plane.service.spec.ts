import { Test, TestingModule } from '@nestjs/testing';
import { ControlPlaneService } from '../control-plane.service';
import { PrismaService } from '../../prisma.service';

const row = (accountId: string, over: Record<string, unknown> = {}) => ({
  id: `cp_${accountId}`,
  accountId,
  enabled: true,
  smsEnabled: true,
  emailEnabled: true,
  docusignEnabled: true,
  externalDataEnabled: true,
  aiEnabled: true,
  aiDailyCostCap: 2,
  apiDailyCostCap: 50,
  updatedAt: new Date(),
  updatedBy: null,
  ...over,
});

describe('ControlPlaneService', () => {
  let service: ControlPlaneService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      controlPlane: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async ({ data }: any) => row(data.accountId)),
        upsert: jest.fn(async ({ where }: any) => row(where.accountId)),
      },
      integrationBudgetBucket: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ControlPlaneService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(ControlPlaneService);
  });

  const stub = (tenant: any, global: any = null) => {
    prisma.controlPlane.findUnique.mockImplementation(async ({ where }: any) =>
      where.accountId === 'GLOBAL' ? global : tenant,
    );
  };

  describe('tenant scoping', () => {
    it('reads the row for the requested tenant', async () => {
      stub(row('tenant-a'));
      const status = await service.getStatus('tenant-a');
      expect(status.accountId).toBe('tenant-a');
      expect(prisma.controlPlane.findUnique).toHaveBeenCalledWith({
        where: { accountId: 'tenant-a' },
      });
    });

    it('provisions defaults when a tenant has no row', async () => {
      stub(null);
      const status = await service.getStatus('brand-new');
      // Persisted, not an invisible in-memory assumption.
      expect(prisma.controlPlane.create).toHaveBeenCalledWith({
        data: { accountId: 'brand-new' },
      });
      expect(status.enabled).toBe(true);
    });

    it('writes updates against the caller tenant only', async () => {
      await service.updateStatus('tenant-a', { smsEnabled: false }, 'user-1');
      expect(prisma.controlPlane.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { accountId: 'tenant-a' } }),
      );
    });
  });

  describe('GLOBAL master switch', () => {
    it('can turn a flag off that the tenant has on', async () => {
      stub(
        row('tenant-a', { smsEnabled: true }),
        row('GLOBAL', { smsEnabled: false }),
      );
      const status = await service.getStatus('tenant-a');
      expect(status.smsEnabled).toBe(false);
      expect(status.globallyConstrained).toBe(true);
    });

    it('cannot turn a flag on that the tenant has off', async () => {
      // GLOBAL restricts; it never grants more than the tenant configured.
      stub(
        row('tenant-a', { smsEnabled: false }),
        row('GLOBAL', { smsEnabled: true }),
      );
      expect((await service.getStatus('tenant-a')).smsEnabled).toBe(false);
    });

    it('takes the lower of the two caps', async () => {
      stub(
        row('tenant-a', { aiDailyCostCap: 2, apiDailyCostCap: 50 }),
        row('GLOBAL', { aiDailyCostCap: 0.5, apiDailyCostCap: 100 }),
      );
      const status = await service.getStatus('tenant-a');
      expect(status.aiDailyCostCap).toBe(0.5);
      expect(status.apiDailyCostCap).toBe(50);
    });

    it('a disabled GLOBAL row disables every tenant', async () => {
      stub(
        row('tenant-a', { enabled: true }),
        row('GLOBAL', { enabled: false }),
      );
      expect((await service.getStatus('tenant-a')).enabled).toBe(false);
    });

    it('reports no constraint when no GLOBAL row exists', async () => {
      stub(row('tenant-a'));
      const status = await service.getStatus('tenant-a');
      expect(status.globallyConstrained).toBe(false);
      expect(status.enabled).toBe(true);
    });
  });

  describe('derived helpers respect the master switch', () => {
    it('isSmsEnabled is false when the platform switch is off', async () => {
      stub(row('tenant-a'), row('GLOBAL', { enabled: false }));
      expect(await service.isSmsEnabled('tenant-a')).toBe(false);
    });

    it('isExternalDataEnabled requires both enabled and the channel flag', async () => {
      stub(row('tenant-a', { externalDataEnabled: false }));
      expect(await service.isExternalDataEnabled('tenant-a')).toBe(false);
    });
  });
});
