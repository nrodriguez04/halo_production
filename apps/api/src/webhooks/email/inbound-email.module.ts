import { Module } from '@nestjs/common';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';
import { PrismaService } from '../../prisma.service';
import { AutomationModule } from '../../automation/automation.module';
import { AgentModule } from '../../agent/agent.module';
import { DocumentsModule } from '../../documents/documents.module';
import { TimelineModule } from '../../timeline/timeline.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Module({
  imports: [
    AutomationModule,
    AgentModule,
    DocumentsModule,
    TimelineModule,
    IntegrationSecretsModule,
  ],
  controllers: [InboundEmailController],
  providers: [InboundEmailService, PrismaService],
})
export class InboundEmailModule {}
