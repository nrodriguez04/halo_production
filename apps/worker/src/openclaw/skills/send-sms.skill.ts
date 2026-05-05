import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { assertPolicy, buildPolicyContext } from '@halo/shared';
import type { SkillDefinition } from './skill.interface';
import { loadSpendContext } from './spend-context';

@Injectable()
export class SendSmsSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'comms.send_sms',
      description: 'Send an SMS message through the approval queue',
      inputSchema: { to: 'string', body: 'string', dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const cp = await this.prisma.controlPlane.findFirst();
        const sideEffects = cp?.enabled ?? false;
        const messaging = sideEffects && (cp?.smsEnabled ?? false);
        const spend = await loadSpendContext(input.tenantId);

        const ctx = buildPolicyContext({
          tenantId: input.tenantId,
          actorId: null,
          actorType: 'system',
          requestedAction: 'send_sms',
          channel: 'sms',
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
            channel: 'sms',
            direction: 'outbound',
            content: input.body,
            source: 'openclaw',
            status: 'pending_approval',
            metadata: { to: input.to },
          },
        });

        return { messageId: message.id, status: 'pending_approval' };
      },
    };
  }
}
