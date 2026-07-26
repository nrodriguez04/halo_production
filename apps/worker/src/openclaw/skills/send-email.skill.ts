import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { SkillDefinition } from './skill.interface';
import { assertOpenClawMessagingAllowed } from './messaging-policy';

@Injectable()
export class SendEmailSkill {
  constructor(private prisma: PrismaService) {}

  getDefinition(): SkillDefinition {
    return {
      name: 'comms.send_email',
      description: 'Send an email through the approval queue',
      inputSchema: { to: 'string', subject: 'string', body: 'string', dealId: 'string', tenantId: 'string' },
      execute: async (input) => {
        const { dealId, leadId, metadata } = await assertOpenClawMessagingAllowed(
          this.prisma,
          {
            tenantId: input.tenantId,
            dealId: input.dealId,
            channel: 'email',
            recipient: input.to,
            subject: input.subject,
          },
        );

        const message = await this.prisma.message.create({
          data: {
            accountId: input.tenantId,
            dealId,
            leadId,
            channel: 'email',
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
