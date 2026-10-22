import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DocumentsModule } from '../documents/documents.module';
import { IntegrationSecretsModule } from '../integration-secrets/integration-secrets.module';
import { MarketsService } from './markets.service';
import { MarketsController } from './markets.controller';
import { TemplateCatalogService } from './template-catalog.service';
import { DataAccessService } from './data-access.service';

/**
 * Markets (docs/markets.md): every jurisdiction's policy, approvals,
 * authorizations and activation, and the gate other modules ask before
 * contacting sellers, contracting, marketing or assigning.
 */
@Module({
  imports: [DocumentsModule, IntegrationSecretsModule],
  controllers: [MarketsController],
  providers: [
    MarketsService,
    TemplateCatalogService,
    DataAccessService,
    PrismaService,
  ],
  exports: [MarketsService, TemplateCatalogService],
})
export class MarketsModule {}
