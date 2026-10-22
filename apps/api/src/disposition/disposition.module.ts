import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { DealsModule } from '../deals/deals.module';
import { TimelineModule } from '../timeline/timeline.module';
import { CommunicationsModule } from '../communications/communications.module';
import { QueuesModule } from '../queues/queues.module';
import { DocumentsModule } from '../documents/documents.module';
import { BuyersModule } from '../buyers/buyers.module';
import { DispositionGateModule } from './disposition-gate.module';
import { PurchaseAgreementsService } from './purchase-agreements.service';
import { JurisdictionPoliciesService } from './jurisdiction-policies.service';
import { ClosingService } from './closing.service';
import { OffersService } from './offers.service';
import { CampaignsService } from './campaigns.service';
import { DealPackagesService } from './deal-packages.service';
import { ShareLinksService } from './share-links.service';
import { AssignmentsService } from './assignments.service';
import { BuyerMessagingService } from './buyer-messaging.service';
import { PublicDealPagesService } from './public-deal-pages.service';
import { CommandCenterService } from './command-center.service';
import { DispositionSweepService } from './disposition-sweep.service';
import { AgreementDraftingService } from './agreement-drafting.service';
import { TaxSalesService } from './tax-sales.service';
import {
  AgreementTemplatesController,
  AssignmentsController,
  CampaignsController,
  ClosingIssuesController,
  CommandCenterController,
  DealDispositionController,
  DealPackagesController,
  JurisdictionPoliciesController,
  OffersController,
  ShareLinksController,
} from './disposition.controller';
import { PublicDealPagesController } from './public-deal-pages.controller';

/**
 * Contract flipping (docs/contract-flipping.md): the seller contract, state
 * rules, buyer campaigns and offers, the assignment and the closing. The
 * gate itself lives in DispositionGateModule so the deals module can use it
 * without depending on everything here.
 */
@Module({
  imports: [
    DealsModule,
    TimelineModule,
    CommunicationsModule,
    QueuesModule,
    DocumentsModule,
    BuyersModule,
    DispositionGateModule,
  ],
  controllers: [
    DealDispositionController,
    OffersController,
    CampaignsController,
    DealPackagesController,
    ShareLinksController,
    AssignmentsController,
    ClosingIssuesController,
    JurisdictionPoliciesController,
    CommandCenterController,
    AgreementTemplatesController,
    PublicDealPagesController,
  ],
  providers: [
    PrismaService,
    PurchaseAgreementsService,
    JurisdictionPoliciesService,
    ClosingService,
    OffersService,
    CampaignsService,
    DealPackagesService,
    ShareLinksService,
    AssignmentsService,
    BuyerMessagingService,
    PublicDealPagesService,
    CommandCenterService,
    DispositionSweepService,
    AgreementDraftingService,
    TaxSalesService,
  ],
  exports: [
    PurchaseAgreementsService,
    AssignmentsService,
    OffersService,
    ClosingService,
    CampaignsService,
  ],
})
export class DispositionModule {}
