import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TimelineEntityType } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import { TimelineService } from './timeline.service';

@Controller('timeline')
@UseGuards(AuthGuard)
export class TimelineController {
  constructor(private readonly timelineService: TimelineService) {}

  @Get(':entityType/:entityId')
  async getTimeline(
    @CurrentAccountId() accountId: string,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
    @Query('limit') limit?: string,
  ) {
    return this.timelineService.getEntityTimeline(
      accountId,
      entityType as TimelineEntityType,
      entityId,
      limit ? parseInt(limit, 10) : 100,
    );
  }
}
