import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PropertiesService } from '../properties.service';
import { PrismaService } from '../../prisma.service';

describe('PropertiesService', () => {
  let service: PropertiesService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      lead: {
        findFirst: jest.fn(),
      },
      property: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PropertiesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PropertiesService>(PropertiesService);
  });

  describe('create', () => {
    it('rejects cross-tenant lead links', async () => {
      prisma.lead.findFirst.mockResolvedValue(null);

      await expect(
        service.create({
          accountId: 'account-1',
          leadId: 'lead-foreign',
          address: '123 Main St',
          city: 'Austin',
          state: 'TX',
          zip: '78701',
          confidence: 1,
        }),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.property.create).not.toHaveBeenCalled();
    });

    it('creates standalone properties without a lead lookup', async () => {
      prisma.property.create.mockResolvedValue({ id: 'property-1' });

      await service.create({
        accountId: 'account-1',
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        confidence: 1,
      });

      expect(prisma.lead.findFirst).not.toHaveBeenCalled();
      expect(prisma.property.create).toHaveBeenCalledWith({
        data: {
          accountId: 'account-1',
          address: '123 Main St',
          city: 'Austin',
          confidence: 1,
          state: 'TX',
          zip: '78701',
        },
        include: {
          sourceRecords: true,
        },
      });
    });

    it('creates a property when the linked lead belongs to the tenant', async () => {
      prisma.lead.findFirst.mockResolvedValue({ id: 'lead-1' });
      prisma.property.create.mockResolvedValue({ id: 'property-1' });

      const data = {
        accountId: 'account-1',
        leadId: 'lead-1',
        address: '123 Main St',
        city: 'Austin',
        state: 'TX',
        zip: '78701',
        confidence: 1,
      };

      await service.create(data);

      expect(prisma.lead.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'lead-1',
          accountId: 'account-1',
        },
        select: { id: true },
      });
      expect(prisma.property.create).toHaveBeenCalledWith({
        data,
        include: {
          sourceRecords: true,
        },
      });
    });
  });
});
