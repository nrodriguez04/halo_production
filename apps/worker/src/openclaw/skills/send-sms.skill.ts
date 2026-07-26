import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { SkillDefinition } from './skill.interface';
import { assertOpenClawMessagingAllowed } from './messaging-policy';

@Injectable()
export class SendSmsSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'comms.send_sms',
      description: 'Send an SMS message through the approval queue',
      inputSchema: { to: 'string', body: 'string', dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const { dealId, leadId, metadata } = await assertOpenClawMessagingAllowed(
          this.prisma,
          {
            tenantId: input.tenantId,
            dealId: input.dealId,
            channel: 'sms',
            recipient: input.to,
          },
        );

        const message = await this.prisma.message.create({
          data: {
            accountId: input.tenantId,
            dealId,
            leadId,
            channel: 'sms',
            direction: 'outbound',
            content: input.body,
            source: 'openclaw',
            status: 'pending_approval',
            metadata,
          },
        });

        return { messageId: message.id, status: 'pending_approval' };
      },
    };
  }
}
