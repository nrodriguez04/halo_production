import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import { PropertyCreateSchema } from '@halo/shared';

@Controller('properties')
@UseGuards(AuthGuard)
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
  ) {
    const validated = PropertyCreateSchema.parse({
      ...(data as object),
      accountId,
    });
    return this.propertiesService.create(validated);
  }

  @Get('map')
  async getMapPins(
    @CurrentAccountId() accountId: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('bbox') bbox?: string,
  ) {
    return this.propertiesService.getMapPins(accountId, { city, state, bbox });
  }

  @Get('search')
  async search(
    @CurrentAccountId() accountId: string,
    @Query('city') city?: string,
    @Query('state') state?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.propertiesService.search(accountId, {
      city,
      state,
      minPrice: minPrice ? parseFloat(minPrice) : undefined,
      maxPrice: maxPrice ? parseFloat(maxPrice) : undefined,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.propertiesService.findOne(id, accountId);
  }

  @Post(':id/reconcile')
  async reconcile(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.propertiesService.reconcile(id, accountId);
  }
}
