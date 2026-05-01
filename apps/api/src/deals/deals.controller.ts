import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { DealsService } from './deals.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { DealCreateSchema, DealStage, DealUpdateSchema } from '@halo/shared';

@Controller('deals')
@UseGuards(AuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const validated = DealCreateSchema.parse({ ...(data as any), accountId });
    return this.dealsService.create(validated, userId);
  }

  @Get()
  async findAll(
    @CurrentAccountId() accountId: string,
    @Query('stage') stage?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.dealsService.findAll(accountId, stage, {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.dealsService.findOne(id, accountId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @Body() data: unknown,
  ) {
    const validated = DealUpdateSchema.parse(data);
    return this.dealsService.update(id, accountId, validated);
  }

  @Put(':id/stage')
  async updateStage(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Body() body: { stage: string },
  ) {
    return this.dealsService.updateStage(
      id,
      accountId,
      body.stage as DealStage,
      userId,
    );
  }
}

