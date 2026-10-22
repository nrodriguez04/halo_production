import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { piiViewer } from '../auth/pii-access';
import { BuyerIntelligenceService } from '../buyers/buyer-intelligence.service';
import { DispositionEligibilityService } from './eligibility.service';
import { PurchaseAgreementsService } from './purchase-agreements.service';
import { ClosingService } from './closing.service';
import { OffersService } from './offers.service';
import { CampaignsService } from './campaigns.service';
import { DealPackagesService } from './deal-packages.service';
import { ShareLinksService } from './share-links.service';
import { AssignmentsService } from './assignments.service';
import { CommandCenterService } from './command-center.service';
import { TaxSalesService } from './tax-sales.service';
import {
  AcceptOfferSchema,
  AssignmentExecutedSchema,
  BuyerDepositSchema,
  CancelAssignmentSchema,
  CancelClosingSchema,
  ConfirmClosingSchema,
  CounterOfferSchema,
  DecideOfferSchema,
  EarnestMoneySchema,
  EndCampaignSchema,
  ExtendAgreementSchema,
  FeeReceivedSchema,
  MarkExecutedSchema,
  MilestoneUpdateSchema,
  PrepareCampaignSchema,
  RaiseIssueSchema,
  RecordAgreementSchema,
  RecordOfferSchema,
  ResolveIssueSchema,
  TerminateAgreementSchema,
  UpdateAgreementSchema,
  UpdateCampaignSchema,
  UpdateClosingSchema,
  VerifyAgreementSchema,
} from './disposition.schemas';
import { z } from 'zod';
import { input } from './parse-input';

/**
 * Binding or material steps (verifying the seller contract, launching
 * buyer outreach, accepting, countering or rejecting an offer, executing
 * an assignment, confirming a closing, recording money) need `deals:approve`
 * (tenant admins have it). Recording facts and preparing drafts do not.
 */
export const APPROVE = 'deals:approve';

const PackageEditSchema = z
  .object({
    askingPrice: z.number().finite().min(0).max(100_000_000).optional(),
    headline: z.string().trim().min(1).max(150).optional(),
    description: z.string().trim().max(4000).optional(),
    accessNotes: z.string().trim().max(1000).optional(),
    buyerDeposit: z
      .number()
      .finite()
      .min(0)
      .max(10_000_000)
      .nullable()
      .optional(),
    extraRisks: z.array(z.string().trim().min(1).max(300)).max(20).optional(),
    shareableDocumentIds: z
      .array(z.string().trim().min(1).max(64))
      .max(30)
      .optional(),
    comps: z
      .array(
        z
          .object({
            address: z.string().trim().min(1).max(200),
            soldPrice: z.number().finite().min(1).max(100_000_000),
            soldAt: z.string().trim().max(10).nullable().default(null),
            sqft: z
              .number()
              .finite()
              .min(1)
              .max(100_000)
              .nullable()
              .default(null),
            distanceMiles: z
              .number()
              .finite()
              .min(0)
              .max(50)
              .nullable()
              .default(null),
            source: z.string().trim().min(1).max(120),
          })
          .strict(),
      )
      .max(10)
      .optional(),
  })
  .strict();

const TaxSaleSchema = z
  .object({
    interestType: z
      .enum(['tax_deed', 'tax_lien_certificate', 'auction_bid', 'unknown'])
      .optional(),
    county: z.string().trim().max(120).nullable().optional(),
    auctionDate: z.coerce.date().nullable().optional(),
    advertisedPrice: z
      .number()
      .finite()
      .min(0)
      .max(100_000_000)
      .nullable()
      .optional(),
    winningBid: z
      .number()
      .finite()
      .min(0)
      .max(100_000_000)
      .nullable()
      .optional(),
    redemptionEndsAt: z.coerce.date().nullable().optional(),
    redeemed: z.boolean().optional(),
    titleStatus: z
      .enum(['unverified', 'clouded', 'quiet_title_needed', 'insurable'])
      .optional(),
    transferable: z.enum(['yes', 'no', 'unknown']).optional(),
    evidenceDocumentId: z.string().trim().min(1).max(64).nullable().optional(),
    notes: z.string().trim().max(4000).nullable().optional(),
  })
  .strict();
const NoteSchema = z
  .object({ note: z.string().trim().max(1000).optional() })
  .strict();

const SellerOfferSchema = z
  .object({
    amount: z.number().finite().min(1).max(100_000_000),
    reason: z.string().trim().min(5).max(1000).optional(),
  })
  .strict();

const ConfirmOfferSchema = z
  .object({ amount: z.number().finite().min(1).max(100_000_000).optional() })
  .strict();
const WithdrawSchema = z
  .object({ reason: z.string().trim().max(500).optional() })
  .strict();

// ------------------------------------------------------------- per deal

@Controller('deals/:dealId')
@UseGuards(AuthGuard, PermissionsGuard)
export class DealDispositionController {
  constructor(
    private center: CommandCenterService,
    private eligibility: DispositionEligibilityService,
    private agreements: PurchaseAgreementsService,
    private closing: ClosingService,
    private offers: OffersService,
    private campaigns: CampaignsService,
    private packages: DealPackagesService,
    private links: ShareLinksService,
    private assignments: AssignmentsService,
    private buyers: BuyerIntelligenceService,
    private taxSales: TaxSalesService,
  ) {}

  @Get('tax-sale')
  taxSale(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.taxSales.get(a, dealId);
  }

  @Put('tax-sale')
  recordTaxSale(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.taxSales.upsert(a, dealId, u, input(TaxSaleSchema, body));
  }

  @Post('tax-sale/verify')
  @Permissions(APPROVE)
  verifyTaxSale(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.taxSales.verify(
      a,
      dealId,
      u,
      input(NoteSchema, body ?? {}).note,
    );
  }

  @Get('workspace')
  workspace(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.center.workspace(a, dealId, piiViewer(user));
  }

  @Get('eligibility')
  eligibilityOf(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
  ) {
    return this.eligibility.evaluate(a, dealId);
  }

  // Seller contract
  @Get('purchase-agreement')
  agreement(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.agreements.get(a, dealId);
  }

  /** What Halo checked about the executed contract before a person verifies it. */
  @Get('purchase-agreement/checks')
  agreementChecks(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
  ) {
    return this.agreements.automatedChecks(a, dealId);
  }

  @Post('purchase-agreement')
  recordAgreement(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.record(
      a,
      dealId,
      u,
      input(RecordAgreementSchema, body),
    );
  }

  @Patch('purchase-agreement')
  updateAgreement(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.update(
      a,
      dealId,
      u,
      UpdateAgreementSchema.parse(body),
    );
  }

  @Post('purchase-agreement/executed')
  agreementExecuted(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.markExecuted(
      a,
      dealId,
      u,
      input(MarkExecutedSchema, body),
    );
  }

  @Post('purchase-agreement/verify')
  @Permissions(APPROVE)
  verifyAgreement(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.verify(
      a,
      dealId,
      u,
      input(VerifyAgreementSchema, body),
    );
  }

  @Post('purchase-agreement/earnest-money')
  earnestMoney(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.recordEarnestMoney(
      a,
      dealId,
      u,
      input(EarnestMoneySchema, body),
    );
  }

  @Post('purchase-agreement/extend')
  @Permissions(APPROVE)
  extend(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.extend(
      a,
      dealId,
      u,
      input(ExtendAgreementSchema, body),
    );
  }

  @Post('purchase-agreement/terminate')
  @Permissions(APPROVE)
  terminate(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.agreements.terminate(
      a,
      dealId,
      u,
      input(TerminateAgreementSchema, body),
    );
  }

  // Buyers and pricing
  @Get('buyer-matches')
  matches(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
    @Query('limit') limit?: string,
  ) {
    const n = Math.min(Math.max(Number(limit) || 25, 1), 200);
    return this.buyers.rankForDeal(a, dealId, { limit: n });
  }

  @Get('pricing')
  pricing(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.offers.pricing(a, dealId);
  }

  @Get('underwriting')
  underwriting(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.offers.underwriting(a, dealId);
  }

  @Post('seller-offer')
  @Permissions(APPROVE)
  sellerOffer(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.offers.setSellerOffer(
      a,
      dealId,
      u,
      input(SellerOfferSchema, body),
    );
  }

  @Get('offers')
  listOffers(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.offers.list(a, dealId);
  }

  @Post('offers')
  recordOffer(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.offers.record(a, dealId, u, input(RecordOfferSchema, body));
  }

  // Campaigns, packages, links
  @Get('campaigns')
  listCampaigns(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
  ) {
    return this.campaigns.listForDeal(a, dealId);
  }

  @Post('campaigns')
  prepareCampaign(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.prepare(
      a,
      dealId,
      u,
      input(PrepareCampaignSchema, body ?? {}),
    );
  }

  @Get('packages')
  listPackages(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.packages.list(a, dealId);
  }

  @Get('links')
  listLinks(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.links.list(a, dealId);
  }

  @Get('assignments')
  listAssignments(
    @CurrentAccountId() a: string,
    @Param('dealId') dealId: string,
  ) {
    return this.assignments.listForDeal(a, dealId);
  }

  // Closing
  @Get('closing')
  getClosing(@CurrentAccountId() a: string, @Param('dealId') dealId: string) {
    return this.closing.get(a, dealId);
  }

  @Post('closing')
  openClosing(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
  ) {
    return this.closing
      .ensureFile(a, dealId, u)
      .then(() => this.closing.get(a, dealId));
  }

  @Patch('closing')
  updateClosing(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.closing.update(a, dealId, u, input(UpdateClosingSchema, body));
  }

  @Post('closing/milestones/:key')
  milestone(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Param('key') key: string,
    @Body() body: unknown,
  ) {
    return this.closing.setMilestone(
      a,
      dealId,
      key,
      u,
      input(MilestoneUpdateSchema, body),
    );
  }

  @Post('closing/issues')
  raiseIssue(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.closing.raiseIssue(a, dealId, u, input(RaiseIssueSchema, body));
  }

  @Post('closing/confirm')
  @Permissions(APPROVE)
  confirmClosing(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.closing.confirmClosing(
      a,
      dealId,
      u,
      input(ConfirmClosingSchema, body),
    );
  }

  @Post('closing/fee-received')
  @Permissions(APPROVE)
  feeReceived(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.closing.recordFeeReceived(
      a,
      dealId,
      u,
      input(FeeReceivedSchema, body),
    );
  }

  @Post('closing/cancel')
  @Permissions(APPROVE)
  cancelClosing(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('dealId') dealId: string,
    @Body() body: unknown,
  ) {
    return this.closing.cancelClosing(
      a,
      dealId,
      u,
      input(CancelClosingSchema, body),
    );
  }
}

// --------------------------------------------------------------- offers

@Controller('offers')
@UseGuards(AuthGuard, PermissionsGuard)
export class OffersController {
  constructor(private offers: OffersService) {}

  @Get(':id')
  get(@CurrentAccountId() a: string, @Param('id') id: string) {
    return this.offers.get(a, id);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offers.confirm(
      a,
      id,
      u,
      ConfirmOfferSchema.parse(body ?? {}).amount,
    );
  }

  @Post(':id/counter')
  @Permissions(APPROVE)
  counter(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offers.counter(a, id, u, input(CounterOfferSchema, body));
  }

  @Post(':id/reject')
  @Permissions(APPROVE)
  reject(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offers.reject(a, id, u, input(DecideOfferSchema, body ?? {}));
  }

  @Post(':id/withdraw')
  withdraw(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offers.withdraw(
      a,
      id,
      u,
      WithdrawSchema.parse(body ?? {}).reason,
    );
  }

  @Post(':id/accept')
  @Permissions(APPROVE)
  accept(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.offers.accept(a, id, u, input(AcceptOfferSchema, body ?? {}));
  }
}

// ------------------------------------------------------------ campaigns

@Controller('campaigns')
@UseGuards(AuthGuard, PermissionsGuard)
export class CampaignsController {
  constructor(private campaigns: CampaignsService) {}

  @Get(':id')
  get(@CurrentAccountId() a: string, @Param('id') id: string) {
    return this.campaigns.get(a, id);
  }

  @Patch(':id')
  update(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.update(a, id, u, input(UpdateCampaignSchema, body));
  }

  @Post(':id/launch')
  @Permissions(APPROVE)
  launch(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.approveAndLaunch(a, id, u);
  }

  @Post(':id/pause')
  pause(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.setStatus(
      a,
      id,
      u,
      'paused',
      EndCampaignSchema.partial().parse(body ?? {}).reason,
    );
  }

  @Post(':id/resume')
  @Permissions(APPROVE)
  resume(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.campaigns.setStatus(a, id, u, 'active');
  }

  @Post(':id/cancel')
  cancel(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.campaigns.setStatus(
      a,
      id,
      u,
      'cancelled',
      EndCampaignSchema.parse(body).reason,
    );
  }
}

@Controller('deal-packages')
@UseGuards(AuthGuard, PermissionsGuard)
export class DealPackagesController {
  constructor(private packages: DealPackagesService) {}

  @Patch(':id')
  edit(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.packages.updateDraft(a, id, u, input(PackageEditSchema, body));
  }

  @Post(':id/approve')
  @Permissions(APPROVE)
  approve(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.packages.approve(a, id, u);
  }
}

@Controller('share-links')
@UseGuards(AuthGuard)
export class ShareLinksController {
  constructor(private links: ShareLinksService) {}

  @Post(':id/revoke')
  revoke(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.links.revoke(a, id, u);
  }
}

@Controller('assignments')
@UseGuards(AuthGuard, PermissionsGuard)
export class AssignmentsController {
  constructor(private assignments: AssignmentsService) {}

  @Post(':id/executed')
  @Permissions(APPROVE)
  executed(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.assignments.markExecuted(
      a,
      id,
      u,
      input(AssignmentExecutedSchema, body),
    );
  }

  @Post(':id/buyer-deposit')
  deposit(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.assignments.recordBuyerDeposit(
      a,
      id,
      u,
      input(BuyerDepositSchema, body),
    );
  }

  @Post(':id/cancel')
  @Permissions(APPROVE)
  cancel(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.assignments.cancel(
      a,
      id,
      u,
      input(CancelAssignmentSchema, body),
    );
  }
}

@Controller('closing-issues')
@UseGuards(AuthGuard)
export class ClosingIssuesController {
  constructor(private closing: ClosingService) {}

  @Post(':id/resolve')
  resolve(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.closing.resolveIssue(
      a,
      id,
      u,
      ResolveIssueSchema.parse(body).resolution,
    );
  }
}

// --------------------------------------------------------- command center

@Controller('command-center')
@UseGuards(AuthGuard)
export class CommandCenterController {
  constructor(private center: CommandCenterService) {}

  @Get('attention')
  attention(@CurrentAccountId() a: string) {
    return this.center.attention(a);
  }

  @Get('portfolio')
  portfolio(@CurrentAccountId() a: string) {
    return this.center.portfolio(a);
  }

  @Get('opportunities')
  opportunities(@CurrentAccountId() a: string, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 25, 1), 100);
    return this.center.opportunities(a, n);
  }
}
