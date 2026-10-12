import { Module } from '@nestjs/common';
import { IntegrationSecretsModule } from '../../integration-secrets/integration-secrets.module';
import { MlsModule } from '../mls/mls.module';
import { RealieModule } from '../realie/realie.module';
import { ListingSourceService } from './listing-source.service';
import { MlsListingsAdapter } from './mls-listings.adapter';
import { RealieLeadsAdapter } from './realie-leads.adapter';
import { RentCastListingsService } from './rentcast-listings.service';

// ControlPlaneService and IntegrationCostControlService come from global modules.
@Module({
  imports: [MlsModule, RealieModule, IntegrationSecretsModule],
  providers: [
    MlsListingsAdapter,
    RentCastListingsService,
    RealieLeadsAdapter,
    ListingSourceService,
  ],
  exports: [ListingSourceService],
})
export class ListingsModule {}
