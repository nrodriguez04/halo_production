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
import { ListingImportService } from './listing-import.service';
import { LISTING_SOURCES } from '../integrations/listings/listing-source.types';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import {
  CurrentAccountId,
  CurrentUser,
  CurrentUserId,
} from '../auth/decorators';
import { piiViewer } from '../auth/pii-access';
import {
  LeadCreateSchema,
  LeadUpdateSchema,
  CSVImportRowSchema,
} from '@halo/shared';

const LeadCreateInputSchema = LeadCreateSchema.omit({ status: true });

const ListingCriteriaSchema = z.object({
  city: z.string().trim().min(1).optional(),
  state: z.string().trim().length(2).optional(),
  postalCode: z.string().trim().min(3).optional(),
  status: z.array(z.string().trim().min(1)).max(5).optional(),
  minPrice: z.number().nonnegative().optional(),
  maxPrice: z.number().nonnegative().optional(),
  minDaysOnMarket: z.number().int().nonnegative().optional(),
  propertyType: z.string().trim().min(1).optional(),
  transferredWithinDays: z.number().int().positive().max(3650).optional(),
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().nonnegative().default(0),
});
const requireArea = {
  check: (c: { city?: string; postalCode?: string }) =>
    Boolean(c.city || c.postalCode),
  message: 'city or postalCode is required',
};
const ListingImportSchema = ListingCriteriaSchema.extend({
  source: z.enum(LISTING_SOURCES).default('mls'),
})
  .strict()
  .refine(requireArea.check, { message: requireArea.message });
const MlsImportSchema = ListingCriteriaSchema.strict().refine(
  requireArea.check,
  { message: requireArea.message },
);

@Controller('leads')
@UseGuards(AuthGuard)
export class LeadsController {
  constructor(
    private readonly leadsService: LeadsService,
    private readonly listingImport: ListingImportService,
  ) {}

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
      { viewer: piiViewer(user) },
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
      piiViewer(user),
    );
  }

  @Get(':id')
  async findOne(
    @Param('id') id: string,
    @CurrentAccountId() accountId: string,
    @CurrentUser() user: unknown,
  ) {
    return this.leadsService.findOne(id, accountId, {
      viewer: piiViewer(user),
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
      viewer: piiViewer(user),
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

  /**
   * Pull records from a configured source (MLS feed, RentCast or Realie
   * county records) into leads. Dedupes against existing leads; safe to re-run.
   */
  @Post('import/listings')
  async importListings(
    @Body() body: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const { source, ...criteria } = ListingImportSchema.parse(body);
    return this.listingImport.importListings(
      source,
      criteria,
      accountId,
      userId,
    );
  }

  /** The MLS feed only; kept for callers of the original route. */
  @Post('import/mls')
  async importMls(
    @Body() body: unknown,
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
  ) {
    const criteria = MlsImportSchema.parse(body);
    return this.listingImport.importListings(
      'mls',
      criteria,
      accountId,
      userId,
    );
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
