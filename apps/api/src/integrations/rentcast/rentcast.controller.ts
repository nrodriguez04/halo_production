import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../../auth/auth.guard';
import { RentCastService } from './rentcast.service';

@Controller('integrations/rentcast')
@UseGuards(AuthGuard)
export class RentCastController {
  constructor(private readonly rentCastService: RentCastService) {}

  @Get('listings')
  async getListings(@Query('city') city: string, @Query('state') state: string) {
    return this.rentCastService.getListings(city, state);
  }

  @Get('property')
  async getProperty(@Query('address') address: string) {
    return this.rentCastService.getPropertyRecord(address);
  }

  @Get('value')
  async getValue(@Query('address') address: string) {
    return this.rentCastService.getValueEstimate(address);
  }
}
