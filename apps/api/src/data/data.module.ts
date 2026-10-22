import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { TimelineModule } from '../timeline/timeline.module';
import { AttomModule } from '../integrations/attom/attom.module';
import { RegridModule } from '../integrations/regrid/regrid.module';
import { IntegrationSecretsModule } from '../integration-secrets/integration-secrets.module';
import { MarketsModule } from '../markets/markets.module';
import { DataAccessService } from '../markets/data-access.service';
import { PropertyFactsService } from './property-facts.service';
import { RecordedSalesService } from './recorded-sales.service';
import { InvestorDiscoveryService } from './investor-discovery.service';
import { MarketIntelligenceService } from './market-intelligence.service';
import { DataController } from './data.controller';

/**
 * Property data, recorded sales, investor discovery and market
 * intelligence (docs/data-pipeline.md).
 */
@Module({
  imports: [
    DocumentsModule,
    TimelineModule,
    AttomModule,
    RegridModule,
    IntegrationSecretsModule,
    MarketsModule,
  ],
  controllers: [DataController],
  providers: [
    PropertyFactsService,
    RecordedSalesService,
    InvestorDiscoveryService,
    MarketIntelligenceService,
    DataAccessService,
  ],
  exports: [PropertyFactsService, RecordedSalesService],
})
export class DataModule {}
