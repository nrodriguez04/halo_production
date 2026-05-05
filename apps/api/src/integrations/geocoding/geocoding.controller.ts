import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { AuthGuard } from '../../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../../auth/decorators';

@Controller('integrations/geocoding')
@UseGuards(AuthGuard)
export class GeocodingController {
  constructor(private readonly geocodingService: GeocodingService) {}

  @Get()
  async geocode(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('address') address: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('zip') zip?: string,
  ) {
    return this.geocodingService.geocode(address, city, state, zip, {
      accountId,
      actor: 'user',
      userId,
    });
  }

  @Get('reverse')
  async reverseGeocode(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Query('lat') lat: string,
    @Query('lng') lng: string,
  ) {
    return this.geocodingService.reverseGeocode(parseFloat(lat), parseFloat(lng), {
      accountId,
      actor: 'user',
      userId,
    });
  }
}
