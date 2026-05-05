import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { LeadsService } from './leads.service';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { LeadCreateSchema, LeadUpdateSchema, CSVImportRowSchema } from '@halo/shared';

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const validated = LeadCreateSchema.parse({ ...(data as any), accountId });
    return this.leadsService.create(validated, userId ?? null);
  }

  @Get()
  async findAll(
    @CurrentAccountId() accountId: string,
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
    @Query('search') search?: string,
  ) {
    return this.leadsService.findAll(accountId, {
      status,
      search,
      skip: skip ? parseInt(skip, 10) : 0,
      take: take ? Math.min(parseInt(take, 10), 200) : 50,
    });
  }

  @Get('duplicates')
  async findDuplicates(
    @CurrentAccountId() accountId: string,
    @Query('threshold') threshold?: string,
  ) {
    const thresholdNum = threshold ? parseFloat(threshold) : 0.8;
    return this.leadsService.findPotentialDuplicates(accountId, thresholdNum);
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.leadsService.findOne(id, accountId);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @Body() data: unknown,
  ) {
    const validated = LeadUpdateSchema.parse(data);
    return this.leadsService.update(id, accountId, validated);
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
  ) {
    return this.leadsService.remove(id, accountId);
  }

  @Post('import/csv')
  async importCSV(
    @Body() body: { rows: unknown[] },
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const validatedRows = body.rows.map((row) => CSVImportRowSchema.parse(row));
    return this.leadsService.importCSV(validatedRows, accountId, userId);
  }

  @Post('merge')
  async mergeLeads(
    @Body() body: { sourceId: string; targetId: string },
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.leadsService.mergeLeads(
      body.sourceId,
      body.targetId,
      accountId,
      userId,
    );
  }

  @Post('mark-distinct')
  async markAsDistinct(
    @Body() body: { lead1Id: string; lead2Id: string },
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    return this.leadsService.markAsDistinct(
      body.lead1Id,
      body.lead2Id,
      accountId,
      userId,
    );
  }
}

