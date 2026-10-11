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
import { CurrentAccountId, CurrentUser } from '../auth/decorators';
import { piiViewer } from '../auth/pii-access';
import { BuyerCreateSchema, BuyerUpdateSchema } from '@halo/shared';

@Controller('buyers')
@UseGuards(AuthGuard)
export class BuyersController {
  constructor(private readonly buyersService: BuyersService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    const validated = BuyerCreateSchema.parse({ ...(data as any), accountId });
    return this.buyersService.create(validated, piiViewer(user));
  }

  @Get()
  async findAll(
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.buyersService.findAll(
      accountId,
      {
        skip: skip ? parseInt(skip, 10) : 0,
        take: take ? parseInt(take, 10) : 50,
      },
      piiViewer(user),
    );
  }

  @Get('match/:dealId')
  async matchBuyers(
    @Param('dealId') dealId: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.buyersService.matchBuyers(dealId, accountId, piiViewer(user));
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.buyersService.findOne(id, accountId, piiViewer(user));
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    const validated = BuyerUpdateSchema.parse(data);
    return this.buyersService.update(id, accountId, validated, piiViewer(user));
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentAccountId() accountId: string) {
    return this.buyersService.remove(id, accountId);
  }
}
