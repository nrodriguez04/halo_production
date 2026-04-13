import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class UnderwriteDealSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'underwriting.analyze',
      description: 'Run AI underwriting analysis on a deal',
      inputSchema: { dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'ai_underwrite',
          channel: 'ai_underwrite',
          sideEffectsEnabled: true,
          messagingEnabled: false,
          aiEnabled: true,
        });
        assertPolicy(ctx);

        const jobRun = await this.prisma.jobRun.create({
          data: {
            tenantId: input.tenantId,
            kind: 'UNDERWRITE_DEAL',
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
