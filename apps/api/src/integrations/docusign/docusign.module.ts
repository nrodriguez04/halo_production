import { Module } from '@nestjs/common';
import { DocuSignController } from './docusign.controller';
import { DocuSignService } from './docusign.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { TimelineModule } from '../../timeline/timeline.module';
import { DealsModule } from '../../deals/deals.module';
import { DocumentsModule } from '../../documents/documents.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { DispositionModule } from '../../disposition/disposition.module';
import { DispositionGateModule } from '../../disposition/disposition-gate.module';

@Module({
  imports: [
    ControlPlaneModule,
    TimelineModule,
    DealsModule,
    DocumentsModule,
    IntegrationSecretsModule,
    DispositionModule,
    DispositionGateModule,
  ],
  controllers: [DocuSignController],
  providers: [DocuSignService],
  exports: [DocuSignService],
})
export class DocuSignIntegrationModule {}
