import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { hashEmail, hashPhone } from '@halo/shared';
import { BuyersService } from '../buyers.service';
import { PrismaService } from '../../prisma.service';
import { PIIService } from '../../pii/pii.service';
import { protectBuyerContact } from '../buyer-pii';
import { piiViewer } from '../../auth/pii-access';

describe('BuyersService', () => {
  let service: BuyersService;
  let prisma: any;

  beforeAll(() => {
    process.env.PII_ENCRYPTION_KEY_V1 = '11'.repeat(32);
    process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION = '1';
    process.env.PII_INDEX_KEY = '22'.repeat(32);
  });

  beforeEach(async () => {
    prisma = {
      buyer: {
        create: jest.fn(async (args: any) => ({ id: 'buyer-1', ...args.data })),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      deal: {
        findFirst: jest.fn(),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyersService,
        PIIService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BuyersService>(BuyersService);
  });

  const stored = () => ({
    id: 'buyer-1',
    accountId: 'account-1',
    name: 'Acme Holdings',
    ...protectBuyerContact({
      email: 'deals@acme.example',
      phone: '(512) 555-0199',
    }),
  });

  describe('contacts at rest', () => {
    it('stores email and phone only as ciphertext and blind index', async () => {
      const out = await service.create({
        accountId: 'account-1',
        name: 'Acme Holdings',
        email: 'Deals@Acme.example',
        phone: '(512) 555-0199',
      });

      const data = prisma.buyer.create.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('email');
      expect(data).not.toHaveProperty('phone');
      expect(data.emailHash).toBe(hashEmail('deals@acme.example'));
      expect(data.phoneHash).toBe(hashPhone('+15125550199'));
      expect(JSON.stringify(data)).not.toContain('555-0199');
      expect(JSON.stringify(data)).not.toContain('Acme.example');
      // No viewer: the response is masked.
      expect(out.email).toBe('D•••@Acme.example');
      expect(out.phone).toBe('••• ••• 0199');
    });

    it('re-encrypts only the contact fields an update names', async () => {
      prisma.buyer.findFirst.mockResolvedValue(stored());
      prisma.buyer.update.mockImplementation(async (args: any) => ({
        ...stored(),
        ...args.data,
      }));

      await service.update('buyer-1', 'account-1', { phone: '+15125550123' });

      const data = prisma.buyer.update.mock.calls[0][0].data;
      expect(Object.keys(data).sort()).toEqual(['phoneEnc', 'phoneHash']);
      expect(data.phoneHash).toBe(hashPhone('+15125550123'));
    });

    it('lists buyers masked unless the viewer may see contacts', async () => {
      prisma.buyer.findMany.mockResolvedValue([stored()]);

      const masked = await service.findAll(
        'account-1',
        {},
        piiViewer({ accountId: 'account-1', userId: 'u1', permissions: [] }),
      );
      expect(masked[0]).toEqual(
        expect.objectContaining({
          email: 'd•••@acme.example',
          phone: '••• ••• 0199',
        }),
      );
      expect(masked[0]).not.toHaveProperty('emailEnc');
      expect(prisma.auditLog.create).not.toHaveBeenCalled();

      const revealed = await service.findAll(
        'account-1',
        {},
        piiViewer({
          accountId: 'account-1',
          userId: 'u2',
          permissions: ['pii:read'],
        }),
      );
      expect(revealed[0].email).toBe('deals@acme.example');
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accountId: 'account-1',
          userId: 'u2',
          action: 'pii.reveal',
          resource: 'buyer:buyer-1',
        }),
      });
    });
  });

  describe('update', () => {
    it('rejects accountId rewrites before mutating the buyer', async () => {
      await expect(
        service.update('buyer-1', 'account-1', {
          accountId: 'account-2',
        } as any),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.buyer.findFirst).not.toHaveBeenCalled();
      expect(prisma.buyer.update).not.toHaveBeenCalled();
    });

    it('updates safe fields for a buyer in the same tenant', async () => {
      prisma.buyer.findFirst.mockResolvedValue({
        id: 'buyer-1',
        accountId: 'account-1',
      });
      prisma.buyer.update.mockResolvedValue({
        id: 'buyer-1',
        accountId: 'account-1',
        name: 'Updated Buyer',
      });

      const result = await service.update('buyer-1', 'account-1', {
        name: 'Updated Buyer',
      });

      expect(prisma.buyer.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { name: 'Updated Buyer' },
      });
      expect(result.name).toBe('Updated Buyer');
    });
  });
});
