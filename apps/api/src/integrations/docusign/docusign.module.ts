import { Module } from '@nestjs/common';
import { DocuSignController } from './docusign.controller';
import { DocuSignService } from './docusign.service';
import { PrismaService } from '../../prisma.service';
import { ControlPlaneModule } from '../../control-plane/control-plane.module';
import { TimelineModule } from '../../timeline/timeline.module';
import { DealsModule } from '../../deals/deals.module';
import { DocumentsModule } from '../../documents/documents.module';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';

@Module({
  imports: [
    ControlPlaneModule,
    TimelineModule,
    DealsModule,
    DocumentsModule,
    IntegrationSecretsModule,
  ],
  controllers: [DocuSignController],
  providers: [DocuSignService, PrismaService],
  exports: [DocuSignService],
})
export class DocuSignIntegrationModule {}
