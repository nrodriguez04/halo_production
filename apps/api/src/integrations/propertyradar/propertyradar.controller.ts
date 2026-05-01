import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PropertyRadarService } from './propertyradar.service';
import { AuthGuard } from '../../auth/auth.guard';

@Controller('integrations/propertyradar')
@UseGuards(AuthGuard)
export class PropertyRadarController {
  constructor(private readonly service: PropertyRadarService) {}

  @Post('search')
  async searchProperties(
    @Body() body: { criteria: any; limit?: number; start?: number },
  ) {
    return this.service.searchProperties(body.criteria, {
      limit: body.limit,
      start: body.start,
    });
  }

  @Get('properties/:radarId')
  async getPropertyDetails(@Param('radarId') radarId: string) {
    return this.service.getPropertyDetails(radarId);
  }

  @Get('properties/:radarId/owner')
  async getOwnerDetails(@Param('radarId') radarId: string) {
    return this.service.getOwnerDetails(radarId);
  }

  @Get('properties/:radarId/contacts')
  async appendContacts(@Param('radarId') radarId: string) {
    return this.service.appendContacts(radarId);
  }

  @Get('properties/:radarId/transactions')
  async getTransactionHistory(@Param('radarId') radarId: string) {
    return this.service.getTransactionHistory(radarId);
  }

  @Get('properties/:radarId/comparables')
  async getComparables(
    @Param('radarId') radarId: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getComparables(radarId, {
      radius: radius ? parseFloat(radius) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post('import')
  async importRecords(
    @Body() body: { records: Array<{ Address: string; City?: string; State?: string; Zip?: string }> },
  ) {
    return this.service.importRecords(body.records);
  }
}
