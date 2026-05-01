import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { RedisModule } from './redis/redis.module';
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
import { PropertyRadarModule } from './integrations/propertyradar/propertyradar.module';
import { PIIModule } from './pii/pii.module';
import { ChaosModule } from './chaos/chaos.module';
import { StorageModule } from './storage/storage.module';
import { AgentModule } from './agent/agent.module';
import { AutomationModule } from './automation/automation.module';
import { DealEconomicsModule } from './deal-economics/deal-economics.module';
import { IntegrationSecretsModule } from './integration-secrets/integration-secrets.module';
import { ApiCostModule } from './api-cost/api-cost.module';
import { PrismaService } from './prisma.service';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { colorize: true } }
            : undefined,
        level: process.env.NODE_ENV !== 'production' ? 'debug' : 'info',
        autoLogging: false,
      },
    }),
    AuditModule,
    RedisModule,
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 1000, limit: 20 },
      { name: 'medium', ttl: 60000, limit: 100 },
    ]),
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
    PropertyRadarModule,
    PIIModule,
    ChaosModule,
    StorageModule,
    AgentModule,
    AutomationModule,
    DealEconomicsModule,
    IntegrationSecretsModule,
    ApiCostModule,
  ],
  providers: [
    PrismaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [PrismaService],
})
export class AppModule {}

