import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BuyerCreate, BuyerUpdate } from '@halo/shared';
import { PIIService } from '../pii/pii.service';
import type { PiiViewer } from '../auth/pii-access';
import { protectBuyerContact } from './buyer-pii';

@Injectable()
export class BuyersService {
  constructor(
    private prisma: PrismaService,
    private pii: PIIService,
  ) {}

  // Buyer email / phone are stored only as ciphertext + blind index. Every
  // method that returns buyers presents them through PIIService: masked, or
  // revealed and audited for a viewer with pii:read.

  async create(data: BuyerCreate, viewer?: PiiViewer | null) {
    const { email, phone, ...rest } = data;
    const buyer = await this.prisma.buyer.create({
      data: { ...rest, ...protectBuyerContact({ email, phone }) },
    });
    return this.pii.presentBuyer(buyer, viewer);
  }

  async findAll(
    accountId: string,
    pagination?: { skip?: number; take?: number },
    viewer?: PiiViewer | null,
  ) {
    const skip = pagination?.skip ?? 0;
    const take = pagination?.take ?? 50;

    const buyers = await this.prisma.buyer.findMany({
      where: { accountId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
    return this.pii.presentBuyers(buyers, viewer);
  }

  async findOne(id: string, accountId: string, viewer?: PiiViewer | null) {
    return this.pii.presentBuyer(await this.loadOwned(id, accountId), viewer);
  }

  private async loadOwned(id: string, accountId: string) {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id, accountId },
    });

    if (!buyer) {
      throw new NotFoundException(`Buyer with ID ${id} not found`);
    }

    return buyer;
  }

  async update(
    id: string,
    accountId: string,
    data: BuyerUpdate,
    viewer?: PiiViewer | null,
  ) {
    if (Object.prototype.hasOwnProperty.call(data, 'accountId')) {
      throw new BadRequestException('accountId cannot be updated');
    }

    await this.loadOwned(id, accountId);
    const { email, phone, ...rest } = data;
    const updated = await this.prisma.buyer.update({
      where: { id },
      data: {
        ...rest,
        // Only the contact fields present in the request are touched.
        ...protectBuyerContact({
          ...('email' in data ? { email: email ?? null } : {}),
          ...('phone' in data ? { phone: phone ?? null } : {}),
        }),
      },
    });
    return this.pii.presentBuyer(updated, viewer);
  }

  async remove(id: string, accountId: string) {
    await this.loadOwned(id, accountId);
    const removed = await this.prisma.buyer.delete({
      where: { id },
    });
    return this.pii.presentBuyer(removed);
  }

  async matchBuyers(
    dealId: string,
    accountId: string,
    viewer?: PiiViewer | null,
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, accountId },
      include: {
        property: true,
        underwritingResult: true,
      },
    });

    if (!deal) {
      throw new NotFoundException(`Deal with ID ${dealId} not found`);
    }

    // Get all buyers for the account
    const buyers = await this.prisma.buyer.findMany({
      where: { accountId: deal.accountId },
    });

    // Simple matching logic - in production, use more sophisticated matching
    const matches = buyers.filter((buyer) => {
      const prefs = buyer.preferences as any;
      if (!prefs) return true;

      // Match by location
      if (prefs.locations && deal.property) {
        const dealLocation = `${deal.property.state}, ${deal.property.city}`;
        if (
          !prefs.locations.some((loc: string) => dealLocation.includes(loc))
        ) {
          return false;
        }
      }

      // Match by price range
      if (prefs.priceRange && deal.offerAmount) {
        if (
          deal.offerAmount < prefs.priceRange.min ||
          deal.offerAmount > prefs.priceRange.max
        ) {
          return false;
        }
      }

      // Match by ARV
      if (prefs.minARV && deal.arv) {
        if (deal.arv < prefs.minARV) {
          return false;
        }
      }

      return true;
    });

    return this.pii.presentBuyers(matches, viewer);
  }
}
