import { Controller, Get, Post, Param, UseGuards } from '@nestjs/common';
import { UnderwritingService } from './underwriting.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';

@Controller('underwriting')
@UseGuards(AuthGuard)
export class UnderwritingController {
  constructor(private readonly underwritingService: UnderwritingService) {}

  @Post('analyze/:dealId')
  async analyze(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.underwritingService.analyze(accountId, userId, dealId);
  }

  @Get('result/:dealId')
  async getResult(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.underwritingService.getResult(accountId, dealId);
  }
}

