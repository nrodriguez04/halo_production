import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { BuyersService } from '../buyers.service';
import { PrismaService } from '../../prisma.service';

describe('BuyersService', () => {
  let service: BuyersService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      buyer: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      deal: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuyersService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<BuyersService>(BuyersService);
  });

  describe('update', () => {
    it('rejects accountId rewrites before mutating the buyer', async () => {
      await expect(
        service.update('buyer-1', 'account-1', { accountId: 'account-2' } as any),
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
