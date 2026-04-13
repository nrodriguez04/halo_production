import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class CreateEnvelopeSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'docusign.create_envelope',
      description: 'Create a DocuSign envelope for a deal',
      inputSchema: { dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'create_envelope',
          channel: 'docusign',
          sideEffectsEnabled: true,
          messagingEnabled: false,
          aiEnabled: false,
        });
        assertPolicy(ctx);

        const deal = await this.prisma.deal.findFirst({
          where: { id: input.dealId, accountId: input.tenantId },
        });

        if (!deal) return { error: 'Deal not found' };

        return {
          dealId: deal.id,
          status: 'envelope_creation_requested',
          message: 'DocuSign envelope creation will be handled by the API layer',
        };
      },
    };
  }
}
