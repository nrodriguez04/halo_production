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
import { CommunicationsService } from './communications.service';
import { QueueService } from '../queues/queue.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { MessageCreateSchema } from '@halo/shared';

@Controller('communications')
@UseGuards(AuthGuard)
export class CommunicationsController {
  constructor(
    private readonly communicationsService: CommunicationsService,
    private readonly queueService: QueueService,
  ) {}

  @Post('messages')
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
  ) {
    const validated = MessageCreateSchema.parse({ ...(data as any), accountId });
    return this.communicationsService.create(validated);
  }

  @Get('messages')
  async findAll(
    @CurrentAccountId() accountId: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.communicationsService.findAll(accountId, status, {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }

  @Get('messages/:id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.communicationsService.findOne(id, accountId);
  }

  @Put('messages/:id/approve')
  async approve(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.communicationsService.approve(
      id,
      accountId,
      userId,
      this.queueService,
    );
  }

  @Put('messages/:id/reject')
  async reject(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.communicationsService.reject(id, accountId, userId, body.reason);
  }

  @Get('approval-queue')
  async getApprovalQueue(
    @CurrentAccountId() accountId: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.communicationsService.findAll(accountId, 'pending_approval', {
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? parseInt(take, 10) : 50,
    });
  }
}

