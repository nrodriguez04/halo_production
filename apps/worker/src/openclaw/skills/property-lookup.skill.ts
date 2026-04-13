import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class PropertyLookupSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'property.lookup',
      description: 'Look up property data from internal DB and external sources',
      inputSchema: { address: 'string', tenantId: 'string' },
      execute: async (input) => {
        const property = await this.prisma.property.findFirst({
          where: {
            accountId: input.tenantId,
            address: { contains: input.address, mode: 'insensitive' },
          },
          include: { sourceRecords: { take: 5, orderBy: { createdAt: 'desc' } } },
        });

        if (property) {
          return {
            found: true,
            id: property.id,
            address: property.address,
            city: property.city,
            state: property.state,
            estimatedValue: property.estimatedValue,
            confidence: property.confidence,
            sourceCount: property.sourceRecords.length,
          };
        }

        return { found: false, message: 'Property not in database. Use ATTOM or RentCast lookup.' };
      },
    };
  }
}
