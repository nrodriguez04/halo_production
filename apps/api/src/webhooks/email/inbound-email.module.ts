import { Module } from '@nestjs/common';
import { InboundEmailController } from './inbound-email.controller';
import { InboundEmailService } from './inbound-email.service';
import { ProviderEventsController } from './provider-events.controller';
import { ProviderEventsService } from './provider-events.service';
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
  controllers: [InboundEmailController, ProviderEventsController],
  providers: [InboundEmailService, ProviderEventsService],
  exports: [ProviderEventsService],
})
export class InboundEmailModule {}
