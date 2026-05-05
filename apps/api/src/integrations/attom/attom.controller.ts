import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AttomService } from './attom.service';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../../auth/decorators';

@Controller('integrations/attom')
@UseGuards(AuthGuard)
export class AttomController {
  constructor(private readonly attomService: AttomService) {}

  @Get('lookup')
  async lookupProperty(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('address') address: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('zip') zip?: string,
  ) {
    return this.attomService.lookupProperty(address, city, state, zip, {
      accountId,
      actor: 'user',
      userId,
    });
  }

  @Get('lookup/apn')
  async lookupByAPN(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('apn') apn: string,
  ) {
    return this.attomService.lookupByAPN(apn, { accountId, actor: 'user', userId });
  }
}
