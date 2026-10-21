import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { input } from '../disposition/parse-input';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { piiViewer } from '../auth/pii-access';
import { BuyerIntelligenceService } from './buyer-intelligence.service';
import {
  BuyerConsentSchema,
  BuyerImportSchema,
  BuyerProfileSchema,
  BuyerTransactionSchema,
  ProofOfFundsSchema,
} from '../disposition/disposition.schemas';

const ChannelSchema = z.enum(['email', 'sms']);

/**
 * Buyer intelligence (docs/contract-flipping.md s5): the evidence behind a
 * buyer, kept by kind, and the consent that lets Halo contact them.
 * Verifying proof of funds is a material decision (`deals:approve`).
 */
@Controller('buyers')
@UseGuards(AuthGuard, PermissionsGuard)
export class BuyerIntelligenceController {
  constructor(private intel: BuyerIntelligenceService) {}

  @Post('import')
  import(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.intel.importBuyers(a, u, input(BuyerImportSchema, body));
  }

  @Get(':id/profile')
  profile(
    @CurrentAccountId() a: string,
    @Param('id') id: string,
    @CurrentUser() user: unknown,
  ) {
    return this.intel.profile(a, id, piiViewer(user));
  }

  @Patch(':id/profile')
  updateProfile(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intel.updateProfile(a, id, u, input(BuyerProfileSchema, body));
  }

  @Post(':id/proof-of-funds')
  @Permissions('deals:approve')
  proofOfFunds(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intel.setProofOfFunds(
      a,
      id,
      u,
      input(ProofOfFundsSchema, body),
    );
  }

  @Post(':id/transactions')
  addTransaction(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intel.addTransaction(
      a,
      id,
      u,
      input(BuyerTransactionSchema, body),
    );
  }

  @Delete(':id/transactions/:txId')
  removeTransaction(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Param('txId') txId: string,
  ) {
    return this.intel.removeTransaction(a, id, txId, u);
  }

  @Post(':id/consents')
  recordConsent(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intel.recordConsent(a, id, u, input(BuyerConsentSchema, body));
  }

  @Delete(':id/consents/:channel')
  revokeConsent(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Param('channel') channel: string,
  ) {
    return this.intel.revokeConsent(a, id, u, ChannelSchema.parse(channel));
  }
}
