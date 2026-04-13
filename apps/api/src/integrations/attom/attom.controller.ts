import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AttomService } from './attom.service';
import { AuthGuard } from '../../auth/auth.guard';

@Controller('integrations/attom')
@UseGuards(AuthGuard)
export class AttomController {
  constructor(private readonly attomService: AttomService) {}

  @Get('lookup')
  async lookupProperty(
    @Query('address') address: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('zip') zip?: string,
  ) {
    return this.attomService.lookupProperty(address, city, state, zip);
  }

  @Get('lookup/apn')
  async lookupByAPN(@Query('apn') apn: string) {
    return this.attomService.lookupByAPN(apn);
  }
}

