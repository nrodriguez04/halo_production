import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';
import { loadSpendContext } from './spend-context';

@Injectable()
export class SendEmailSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'comms.send_email',
      description: 'Send an email through the approval queue',
      inputSchema: { to: 'string', subject: 'string', body: 'string', dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const cp = await this.prisma.controlPlane.findFirst();
        const sideEffects = cp?.enabled ?? false;
        const messaging = sideEffects && (cp?.emailEnabled ?? false);
        const spend = await loadSpendContext(input.tenantId);

        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'send_email',
          channel: 'email',
          sideEffectsEnabled: sideEffects,
          messagingEnabled: messaging,
          aiEnabled: false,
          ...spend,
        });
        assertPolicy(ctx);

        const message = await this.prisma.message.create({
          data: {
            accountId: input.tenantId,
            dealId: input.dealId,
            channel: 'email',
            direction: 'outbound',
            content: input.body,
            source: 'openclaw',
            status: 'pending_approval',
            metadata: { to: input.to, subject: input.subject },
          },
        });

        return { messageId: message.id, status: 'pending_approval' };
      },
    };
  }
}
