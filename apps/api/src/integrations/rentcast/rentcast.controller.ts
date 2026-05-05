import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../../auth/decorators';
import { RentCastService } from './rentcast.service';

@Controller('integrations/rentcast')
@UseGuards(AuthGuard)
export class RentCastController {
  constructor(private readonly rentCastService: RentCastService) {}

  @Get('listings')
  async getListings(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('city') city: string,
    @Query('state') state: string,
  ) {
    return this.rentCastService.getListings(city, state, { accountId, actor: 'user', userId });
  }

  @Get('property')
  async getProperty(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('address') address: string,
  ) {
    return this.rentCastService.getPropertyRecord(address, {
      accountId,
      actor: 'user',
      userId,
    });
  }

  @Get('value')
  async getValue(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('address') address: string,
  ) {
    return this.rentCastService.getValueEstimate(address, {
      accountId,
      actor: 'user',
      userId,
    });
  }
}
