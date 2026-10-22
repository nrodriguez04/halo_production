import { Module } from '@nestjs/common';
import { DocuSignController } from './docusign.controller';
import { DocuSignService } from './docusign.service';
import { TimelineModule } from '../../timeline/timeline.module';
import { DealsModule } from '../../deals/deals.module';
import { DocuSignIntegrationModule } from '../../integrations/docusign/docusign.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Module({
  imports: [
    TimelineModule,
    DealsModule,
    DocuSignIntegrationModule,
    IntegrationSecretsModule,
  ],
  controllers: [DocuSignController],
  providers: [DocuSignService],
})
export class DocuSignModule {}
