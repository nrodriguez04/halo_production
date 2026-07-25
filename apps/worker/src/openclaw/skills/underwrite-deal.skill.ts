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
      description:
        'Unavailable: underwriting queueing is not wired in this build',
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

        const deal = await this.prisma.deal.findFirst({
          where: { id: input.dealId, accountId: input.tenantId },
        });

        if (!deal) return { error: 'Deal not found' };

        throw new Error(
          'Underwriting is unavailable: no underwriting job was enqueued.',
        );
      },
    };
  }
}
