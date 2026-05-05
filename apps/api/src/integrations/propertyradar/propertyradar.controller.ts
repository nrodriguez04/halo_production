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
import { CurrentAccountId, CurrentUserId } from '../../auth/decorators';

@Controller('integrations/propertyradar')
@UseGuards(AuthGuard)
export class PropertyRadarController {
  constructor(private readonly service: PropertyRadarService) {}

  @Post('search')
  async searchProperties(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: { criteria: any; limit?: number; start?: number },
  ) {
    return this.service.searchProperties(
      body.criteria,
      { limit: body.limit, start: body.start },
      { accountId, actor: 'user', userId },
    );
  }

  @Get('properties/:radarId')
  async getPropertyDetails(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('radarId') radarId: string,
  ) {
    return this.service.getPropertyDetails(radarId, { accountId, actor: 'user', userId });
  }

  @Get('properties/:radarId/owner')
  async getOwnerDetails(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('radarId') radarId: string,
  ) {
    return this.service.getOwnerDetails(radarId, { accountId, actor: 'user', userId });
  }

  @Get('properties/:radarId/contacts')
  async appendContacts(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('radarId') radarId: string,
  ) {
    return this.service.appendContacts(radarId, { accountId, actor: 'user', userId });
  }

  @Get('properties/:radarId/transactions')
  async getTransactionHistory(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('radarId') radarId: string,
  ) {
    return this.service.getTransactionHistory(radarId, { accountId, actor: 'user', userId });
  }

  @Get('properties/:radarId/comparables')
  async getComparables(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('radarId') radarId: string,
    @Query('radius') radius?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getComparables(
      radarId,
      {
        radius: radius ? parseFloat(radius) : undefined,
        limit: limit ? parseInt(limit, 10) : undefined,
      },
      { accountId, actor: 'user', userId },
    );
  }

  @Post('import')
  async importRecords(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: { records: Array<{ Address: string; City?: string; State?: string; Zip?: string }> },
  ) {
    return this.service.importRecords(body.records, { accountId, actor: 'user', userId });
  }
}
