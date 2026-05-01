import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { MarketingService } from './marketing.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';

const GenerateBlastSchema = z
  .object({
    buyerIds: z.array(z.string()).min(1),
  })
  .strict();

@Controller('marketing')
@UseGuards(AuthGuard)
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('flyer/:dealId')
  async generateFlyer(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.marketingService.generateFlyer(accountId, userId, dealId);
  }

  @Post('buyer-blast/:dealId')
  async generateBuyerBlast(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: unknown,
  ) {
    const data = GenerateBlastSchema.parse(body);
    return this.marketingService.generateBuyerBlast(
      accountId,
      userId,
      dealId,
      data.buyerIds,
    );
  }

  @Get('flyer/:dealId')
  async getFlyerDraft(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.marketingService.getLastFlyerDraft(accountId, dealId);
  }

  @Get('buyer-blast/:dealId')
  async getBuyerBlastDraft(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.marketingService.getLastBuyerBlastDraft(accountId, dealId);
  }

  @Post('video-script/:dealId')
  async generateVideoScript(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.marketingService.generateVideoScript(accountId, userId, dealId);
  }
}


