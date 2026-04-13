import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { LeadsModule } from './leads/leads.module';
import { PropertiesModule } from './properties/properties.module';
import { DealsModule } from './deals/deals.module';
import { CommunicationsModule } from './communications/communications.module';
import { ControlPlaneModule } from './control-plane/control-plane.module';
import { UnderwritingModule } from './underwriting/underwriting.module';
import { TwilioModule } from './webhooks/twilio/twilio.module';
import { DocuSignModule } from './webhooks/docusign/docusign.module';
import { AttomModule } from './integrations/attom/attom.module';
import { GeocodingModule } from './integrations/geocoding/geocoding.module';
import { DocuSignIntegrationModule } from './integrations/docusign/docusign.module';
import { BuyersModule } from './buyers/buyers.module';
import { MarketingModule } from './marketing/marketing.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { QueuesModule } from './queues/queues.module';
import { TimelineModule } from './timeline/timeline.module';
import { JobsModule } from './jobs/jobs.module';
import { RentCastModule } from './integrations/rentcast/rentcast.module';
import { PIIModule } from './pii/pii.module';
import { ChaosModule } from './chaos/chaos.module';
import { StorageModule } from './storage/storage.module';
import { PrismaService } from './prisma.service';

@Module({
  imports: [
    HealthModule,
    LeadsModule,
    PropertiesModule,
    DealsModule,
    CommunicationsModule,
    ControlPlaneModule,
    UnderwritingModule,
    TwilioModule,
    DocuSignModule,
    AttomModule,
    GeocodingModule,
    DocuSignIntegrationModule,
    BuyersModule,
    MarketingModule,
    AnalyticsModule,
    QueuesModule,
    TimelineModule,
    JobsModule,
    RentCastModule,
    PIIModule,
    ChaosModule,
    StorageModule,
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class AppModule {}

