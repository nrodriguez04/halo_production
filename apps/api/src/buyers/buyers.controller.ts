import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BuyersService } from './buyers.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import { BuyerCreateSchema } from '@halo/shared';

@Controller('buyers')
@UseGuards(AuthGuard)
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
  ) {
    const validated = BuyerCreateSchema.parse({ ...(data as any), accountId });
    return this.buyersService.create(validated);
  }

  @Get()
  async findAll(
    @CurrentAccountId() accountId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.buyersService.findAll(accountId, {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  @Get('match/:dealId')
  async matchBuyers(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.buyersService.matchBuyers(dealId, accountId);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.buyersService.findOne(id, accountId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
  ) {
    return this.buyersService.update(id, accountId, data as any);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.buyersService.remove(id, accountId);
  }
}
