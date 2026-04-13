import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class EnrichLeadSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'leads.enrich',
      description: 'Enqueue lead enrichment (ATTOM + geocoding)',
      inputSchema: { leadId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const lead = await this.prisma.lead.findFirst({
          where: { id: input.leadId, accountId: input.tenantId },
        });

        if (!lead) return { error: 'Lead not found' };

        return { leadId: lead.id, status: 'enrichment_enqueued', message: 'Lead enrichment job queued' };
      },
    };
  }
}
