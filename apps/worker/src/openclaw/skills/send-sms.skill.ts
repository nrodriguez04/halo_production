import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';

@Injectable()
export class SendSmsSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'comms.send_sms',
      description: 'Send an SMS message through the approval queue',
      inputSchema: { to: 'string', body: 'string', dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'send_sms',
          channel: 'sms',
          sideEffectsEnabled: true,
          messagingEnabled: true,
          aiEnabled: false,
        });
        assertPolicy(ctx);

        const message = await this.prisma.message.create({
          data: {
            accountId: input.tenantId,
            dealId: input.dealId,
            channel: 'sms',
            direction: 'outbound',
            content: input.body,
            toAddress: input.to,
            status: 'pending_approval',
            metadata: { source: 'openclaw' },
          },
        });

        return { messageId: message.id, status: 'pending_approval' };
      },
    };
  }
}
