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
import {
  ASSET_CLASSES,
  CommercialCriteriaSchema,
  LandCriteriaSchema,
} from '@halo/shared';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { AutoEnrichService } from './auto-enrich.service';
import { LISTING_SOURCES } from '../integrations/listings/listing-source.types';
import {
  MAX_BATCH,
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
    land: LandCriteriaSchema.optional(),
    commercial: CommercialCriteriaSchema.optional(),
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
    assetClasses: z.array(z.enum(ASSET_CLASSES)).min(1).max(3).optional(),
    criteria: MarketCriteriaSchema.optional(),
    cadence: z.enum(SOURCING_CADENCES).optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

/**
 * An area is a city or ZIP; a land or commercial market may instead name
 * its counties (rural land often has neither).
 */
const MarketSchema = MarketShape.refine(
  (m) =>
    m.city ||
    m.postalCode ||
    (m.criteria?.land?.counties?.length ?? 0) > 0 ||
    (m.criteria?.commercial?.counties?.length ?? 0) > 0,
  { message: 'city, postalCode or a county is required' },
);

const EstimateSchema = z
  .object({
    state: z.string().trim().length(2),
    sources: z.array(z.enum(LISTING_SOURCES)).min(1),
    assetClasses: z.array(z.enum(ASSET_CLASSES)).min(1).max(3).optional(),
    cadence: z.enum(SOURCING_CADENCES).optional(),
    limit: z.number().int().min(1).max(200).optional(),
  })
  .strict();

const RunSchema = z
  .object({ limit: z.number().int().min(1).max(MAX_BATCH).optional() })
  .strict();
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

  /** What a market would cost to run and what its sources can filter, before anything is pulled. */
  @Post('estimate')
  estimate(@CurrentAccountId() accountId: string, @Body() body: unknown) {
    return this.sourcing.estimate(
      accountId,
      EstimateSchema.parse(body) as Parameters<SourcingService['estimate']>[1],
    );
  }

  /** Pull this market now, outside its cadence; `limit` runs a small batch. */
  @Post('markets/:id/run')
  run(
    @CurrentAccountId() accountId: string,
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.sourcing.runNow(
      accountId,
      id,
      userId,
      RunSchema.parse(body ?? {}) as { limit?: number },
    );
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
