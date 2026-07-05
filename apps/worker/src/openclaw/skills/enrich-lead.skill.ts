import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class EnrichLeadSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'leads.enrich',
      description:
        'Unavailable: lead enrichment queueing is not wired in this build',
      inputSchema: { leadId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const lead = await this.prisma.lead.findFirst({
          where: { id: input.leadId, accountId: input.tenantId },
        });

        if (!lead) return { error: 'Lead not found' };

        throw new Error(
          'Lead enrichment is unavailable: no enrichment job was enqueued.',
        );
      },
    };
  }
}
