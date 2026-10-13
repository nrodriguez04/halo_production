import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { AutoEnrichService } from './auto-enrich.service';
import { LISTING_SOURCES } from '../integrations/listings/listing-source.types';
import {
  SOURCING_CADENCES,
  SourcingService,
  type MarketInput,
  type MetrosInput,
} from './sourcing.service';

const MarketCriteriaSchema = z
  .object({
    status: z.array(z.string().trim().min(1)).max(5).optional(),
    minPrice: z.number().nonnegative().optional(),
    maxPrice: z.number().nonnegative().optional(),
    minDaysOnMarket: z.number().int().nonnegative().optional(),
    transferredWithinDays: z.number().int().positive().max(3650).optional(),
    propertyType: z.string().trim().min(1).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

const MarketShape = z
  .object({
    label: z.string().trim().min(1).max(80).optional(),
    state: z.string().trim().length(2),
    city: z.string().trim().min(1).max(80).optional(),
    postalCode: z
      .string()
      .trim()
      .regex(/^\d{5}$/)
      .optional(),
    sources: z.array(z.enum(LISTING_SOURCES)).min(1),
    criteria: MarketCriteriaSchema.optional(),
    cadence: z.enum(SOURCING_CADENCES).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const MarketSchema = MarketShape.refine((m) => m.city || m.postalCode, {
  message: 'city or postalCode is required',
});
const MarketPatchSchema = MarketShape.partial().strict();

const MetrosSchema = z
  .object({
    count: z.number().int().min(1).max(50).default(25),
    sources: z
      .array(z.enum(LISTING_SOURCES))
      .min(1)
      .default(['rentcast', 'realie']),
    criteria: MarketCriteriaSchema.optional(),
    cadence: z.enum(SOURCING_CADENCES).default('daily'),
  })
  .strict();

@Controller('sourcing')
@UseGuards(AuthGuard)
export class SourcingController {
  constructor(
    private readonly sourcing: SourcingService,
    private readonly autoEnrich: AutoEnrichService,
  ) {}

  @Get('markets')
  list(@CurrentAccountId() accountId: string) {
    return this.sourcing.list(accountId);
  }

  /** The built-in list the "add top metros" button offers. */
  @Get('metros')
  metros() {
    return this.sourcing.metros();
  }

  @Get('runs')
  runs(@CurrentAccountId() accountId: string, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.sourcing.recentRuns(
      accountId,
      Number.isInteger(n) && n > 0 ? Math.min(n, 100) : 20,
    );
  }

  @Post('markets')
  create(@CurrentAccountId() accountId: string, @Body() body: unknown) {
    // strictNullChecks is off here, which makes zod infer every key as
    // optional; the schema above is the contract, so the cast is safe.
    return this.sourcing.create(
      accountId,
      MarketSchema.parse(body) as MarketInput,
    );
  }

  @Post('markets/metros')
  addMetros(@CurrentAccountId() accountId: string, @Body() body: unknown) {
    return this.sourcing.createMetros(
      accountId,
      MetrosSchema.parse(body ?? {}) as MetrosInput,
    );
  }

  @Patch('markets/:id')
  update(
    @CurrentAccountId() accountId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sourcing.update(
      accountId,
      id,
      MarketPatchSchema.parse(body) as Partial<MarketInput>,
    );
  }

  @Delete('markets/:id')
  async remove(@CurrentAccountId() accountId: string, @Param('id') id: string) {
    await this.sourcing.remove(accountId, id);
    return { deleted: true, id };
  }

  /** Pull this market now, outside its cadence. */
  @Post('markets/:id/run')
  run(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
  ) {
    return this.sourcing.runNow(accountId, id, userId);
  }

  /** Today's auto-enrichment allowance for this account. */
  @Get('auto-enrich')
  autoEnrichStatus(@CurrentAccountId() accountId: string) {
    return this.autoEnrich.status(accountId);
  }

  /** Runs auto-enrichment for this account now, within today's cap. */
  @Post('auto-enrich/run')
  runAutoEnrich(@CurrentAccountId() accountId: string) {
    return this.autoEnrich.runForAccount(accountId);
  }
}
