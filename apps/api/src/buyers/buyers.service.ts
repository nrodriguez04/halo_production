import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { BuyerCreate } from '@halo/shared';

@Injectable()
export class BuyersService {
  constructor(private prisma: PrismaService) {}

  async create(data: BuyerCreate) {
    return this.prisma.buyer.create({
      data,
    });
  }

  async findAll(
    accountId: string,
    pagination?: { skip?: number; take?: number },
  ) {
    const skip = pagination?.skip ?? 0;
    const take = pagination?.take ?? 50;

    return this.prisma.buyer.findMany({
      where: { accountId },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, accountId: string) {
    const buyer = await this.prisma.buyer.findFirst({
      where: { id, accountId },
    });

    if (!buyer) {
      throw new NotFoundException(`Buyer with ID ${id} not found`);
    }

    return buyer;
  }

  async update(id: string, accountId: string, data: Partial<BuyerCreate>) {
    await this.findOne(id, accountId);
    return this.prisma.buyer.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, accountId: string) {
    await this.findOne(id, accountId);
    return this.prisma.buyer.delete({
      where: { id },
    });
  }

  async matchBuyers(dealId: string, accountId: string) {
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
        if (!prefs.locations.some((loc: string) => dealLocation.includes(loc))) {
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

    return matches;
  }
}

