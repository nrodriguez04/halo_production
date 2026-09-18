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
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { canRevealContactPii } from '../auth/pii-access';
import {
  LeadCreateSchema,
  LeadUpdateSchema,
  CSVImportRowSchema,
} from '@halo/shared';

const LeadCreateInputSchema = LeadCreateSchema.omit({ status: true });

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async create(
    @Body() data: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @CurrentUser() user: unknown,
  ) {
    // Lead lifecycle starts at `new`; later states must flow through
    // LeadLifecycleService so enrichment jobs and timeline events exist.
    const validated = LeadCreateInputSchema.parse({
      ...(data as any),
      accountId,
    });
    return this.leadsService.create(
      {
        ...validated,
        accountId,
        status: 'new',
        tags: validated.tags ?? [],
      },
      userId ?? null,
      { revealPii: canRevealContactPii(user) },
    );
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
    @CurrentUser() user: unknown,
    @Query('threshold') threshold?: string,
  ) {
    const thresholdNum = threshold ? parseFloat(threshold) : 0.8;
    return this.leadsService.findPotentialDuplicates(
      accountId,
      thresholdNum,
      canRevealContactPii(user),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.leadsService.findOne(id, accountId, {
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
    const validated = LeadUpdateSchema.parse(data);
    return this.leadsService.update(id, accountId, validated, {
      revealPii: canRevealContactPii(user),
    });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentAccountId() accountId: string) {
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
