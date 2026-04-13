import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class GenerateFlyerSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'marketing.generate_flyer',
      description: 'Generate a marketing flyer for a deal',
      inputSchema: { dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'generate_flyer',
          channel: 'marketing_flyer',
          sideEffectsEnabled: true,
          messagingEnabled: false,
          aiEnabled: true,
        });
        assertPolicy(ctx);

        const jobRun = await this.prisma.jobRun.create({
          data: {
            tenantId: input.tenantId,
            kind: 'GENERATE_FLYER_DRAFT',
            entityType: 'DEAL',
            entityId: input.dealId,
            status: 'QUEUED',
          },
        });

        return { jobId: jobRun.id, status: 'QUEUED' };
      },
    };
  }
}
