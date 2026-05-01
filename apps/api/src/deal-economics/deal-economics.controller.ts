import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { DealEconomicsService } from './deal-economics.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';

const UpsertDealEconomicsSchema = z
  .object({
    contractPrice: z.number().nullish(),
    assignmentPrice: z.number().nullish(),
    assignmentFee: z.number().nullish(),
    purchasePrice: z.number().nullish(),
    salePrice: z.number().nullish(),
    closingCosts: z.number().nullish(),
    marketingCost: z.number().nullish(),
    skipTraceCost: z.number().nullish(),
    smsCost: z.number().nullish(),
    emailCost: z.number().nullish(),
    aiCostAllocated: z.number().nullish(),
    toolingCost: z.number().nullish(),
    laborCost: z.number().nullish(),
    otherCost: z.number().nullish(),
    notes: z.string().nullish(),
  })
  .strict();

@Controller('deal-economics')
@UseGuards(AuthGuard)
export class DealEconomicsController {
  constructor(
    private readonly dealEconomicsService: DealEconomicsService,
  ) {}

  @Get()
  async listAll(
    @CurrentAccountId() accountId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.dealEconomicsService.getByTenant(accountId, {
      skip: skip ? parseInt(skip, 10) : undefined,
      take: take ? parseInt(take, 10) : undefined,
    });
  }

  @Get(':dealId')
  async getByDeal(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.dealEconomicsService.getByDeal(dealId, accountId);
  }

  @Put(':dealId')
  async upsert(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @Body() body: unknown,
  ) {
    const data = UpsertDealEconomicsSchema.parse(body);
    return this.dealEconomicsService.upsert(dealId, accountId, data);
  }

  @Post(':dealId/allocate-automation-costs')
  async allocateAutomationCosts(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.dealEconomicsService.allocateAutomationCosts(
      dealId,
      accountId,
    );
  }
}
