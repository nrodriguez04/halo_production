import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import { RecordedSalesService } from './recorded-sales.service';
import { InvestorDiscoveryService } from './investor-discovery.service';
import { MarketIntelligenceService } from './market-intelligence.service';
import { PropertyFactsService } from './property-facts.service';
import { RegridService } from '../integrations/regrid/regrid.service';
import { DataAccessService } from '../markets/data-access.service';

/** Importing records and paid provider pulls. */
export const DATA_WRITE = 'data:write';

const SALE_FIELDS = [
  'sourceRef',
  'saleDate',
  'price',
  'buyerName',
  'sellerName',
  'buyerMailingZip',
  'address',
  'city',
  'zip',
  'apn',
  'county',
  'countyFips',
  'state',
  'mortgageAmount',
  'cashPurchase',
  'armsLength',
  'deedType',
  'propertyType',
] as const;

const DocSchema = z
  .object({ documentId: z.string().trim().min(1).max(64) })
  .strict();

const ImportSchema = z
  .object({
    documentId: z.string().trim().min(1).max(64),
    state: z.string().trim().min(2).max(40),
    county: z.string().trim().max(80).nullable().optional(),
    countyFips: z
      .string()
      .regex(/^\d{5}$/)
      .nullable()
      .optional(),
    source: z
      .string()
      .regex(/^[a-z0-9_]{2,40}$/)
      .optional(),
    mapping: z.record(z.enum(SALE_FIELDS), z.string().trim().max(120)),
  })
  .strict();

const AddressSchema = z
  .object({ address: z.string().trim().min(5).max(300) })
  .strict();

const AreaSchema = z
  .object({
    postalCode: z.string().regex(/^\d{5}$/),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    maxPages: z.number().int().min(1).max(10).default(1),
  })
  .strict();

const ParcelSchema = z
  .object({
    address: z.string().trim().min(5).max(300),
    state: z.string().trim().length(2).nullable().optional(),
    leadId: z.string().trim().max(64).nullable().optional(),
  })
  .strict();

const RefreshSchema = z
  .object({
    state: z.string().trim().max(40).nullable().optional(),
    windowDays: z.number().int().min(90).max(1825).optional(),
    minPurchases: z.number().int().min(2).max(20).optional(),
  })
  .strict();

const DismissSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();

/** Property data, recorded sales and investor discovery (docs/data-pipeline.md). */
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class DataController {
  constructor(
    private sales: RecordedSalesService,
    private discovery: InvestorDiscoveryService,
    private intelligence: MarketIntelligenceService,
    private facts: PropertyFactsService,
    private regrid: RegridService,
    private access: DataAccessService,
  ) {}

  @Get('data/sources')
  async sources(@CurrentAccountId() a: string) {
    const [access, summary, regrid] = await Promise.all([
      this.access.forAccount(a),
      this.sales.summary(a),
      this.regrid.configured(),
    ]);
    return {
      providers: access.providers,
      regridConfigured: regrid,
      externalDataEnabled: access.externalDataEnabled,
      statesWithAccess: access.states.size,
      recordedSales: summary,
    };
  }

  @Post('data/recorded-sales/preview')
  preview(@CurrentAccountId() a: string, @Body() body: unknown) {
    return this.sales.previewCsv(a, input(DocSchema, body).documentId);
  }

  @Post('data/recorded-sales/import')
  @Permissions(DATA_WRITE)
  importSales(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.sales.importCsv(a, u, input(ImportSchema, body));
  }

  @Get('data/recorded-sales')
  listSales(
    @CurrentAccountId() a: string,
    @Query('state') state?: string,
    @Query('zip') zip?: string,
    @Query('countyFips') countyFips?: string,
    @Query('limit') limit?: string,
  ) {
    return this.sales.list(a, {
      state,
      zip,
      countyFips,
      limit: Number(limit) || undefined,
    });
  }

  @Post('data/attom/sales-history')
  @Permissions(DATA_WRITE)
  attomHistory(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.sales.pullAttomHistory(
      a,
      u,
      input(AddressSchema, body).address,
    );
  }

  @Post('data/attom/area-sales')
  @Permissions(DATA_WRITE)
  attomArea(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.sales.pullAttomArea(a, u, input(AreaSchema, body));
  }

  /** A Regrid parcel, normalized; with a lead, its facts go onto the lead's property. */
  @Post('data/regrid/parcel')
  @Permissions(DATA_WRITE)
  async parcel(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    const q = input(ParcelSchema, body);
    const out = await this.regrid.parcelByAddress(
      { address: q.address, state: q.state },
      { accountId: a, actor: 'user', userId: u },
    );
    const propertyId =
      out.property && q.leadId
        ? await this.facts.applyToLead(a, q.leadId, out.property)
        : null;
    return { ...out, propertyId };
  }

  @Get('buyer-candidates')
  candidates(
    @CurrentAccountId() a: string,
    @Query('status') status?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.discovery.list(a, {
      status,
      state,
      limit: Number(limit) || undefined,
    });
  }

  @Post('buyer-candidates/refresh')
  refresh(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.discovery.refresh(a, u, input(RefreshSchema, body ?? {}));
  }

  @Post('buyer-candidates/:id/promote')
  promote(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.discovery.promote(a, id, u);
  }

  @Post('buyer-candidates/:id/dismiss')
  dismiss(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.discovery.dismiss(a, id, u, input(DismissSchema, body).reason);
  }

  @Get('market-intelligence')
  geos(
    @CurrentAccountId() a: string,
    @Query('level') level?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.intelligence.geos(a, {
      level: level === 'zip' || level === 'metro' ? level : 'county',
      state,
      limit: Number(limit) || undefined,
    });
  }

  @Get('market-intelligence/recommendations')
  recommendations(
    @CurrentAccountId() a: string,
    @Query('limit') limit?: string,
  ) {
    return this.intelligence.recommendations(
      a,
      Math.min(Number(limit) || 10, 51),
    );
  }
}
