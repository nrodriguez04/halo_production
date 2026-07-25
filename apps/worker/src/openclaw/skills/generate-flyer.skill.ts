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
      description:
        'Unavailable: flyer queueing is not wired in this build',
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

        const deal = await this.prisma.deal.findFirst({
          where: { id: input.dealId, accountId: input.tenantId },
        });

        if (!deal) return { error: 'Deal not found' };

        throw new Error(
          'Flyer generation is unavailable: no marketing job was enqueued.',
        );
      },
    };
  }
}
