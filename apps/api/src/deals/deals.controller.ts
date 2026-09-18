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
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { canRevealContactPii } from '../auth/pii-access';
import { DealCreateSchema, DealStage, DealUpdateSchema } from '@halo/shared';

const DealCreateInputSchema = DealCreateSchema.omit({ stage: true });

@Controller('deals')
@UseGuards(AuthGuard)
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @CurrentUser() user: unknown,
  ) {
    // Deal stage changes must go through the state-machine entrypoint so
    // timelines and downstream automation see a legal transition trail.
    const validated = DealCreateInputSchema.parse({
      ...(data as any),
      accountId,
    });
    return this.dealsService.create(
      {
        ...validated,
        accountId,
        stage: 'new',
      },
      userId,
      { revealPii: canRevealContactPii(user) },
    );
  }

  @Get()
  async findAll(
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
    @Query('stage') stage?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.dealsService.findAll(
      accountId,
      stage,
      {
        skip: skip ? parseInt(skip, 10) : 0,
        take: take ? parseInt(take, 10) : 50,
      },
      canRevealContactPii(user),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.dealsService.findOne(id, accountId, {
      revealPii: canRevealContactPii(user),
    });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
    @Body() data: unknown,
  ) {
    const validated = DealUpdateSchema.parse(data);
    return this.dealsService.update(id, accountId, validated, {
      revealPii: canRevealContactPii(user),
    });
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
