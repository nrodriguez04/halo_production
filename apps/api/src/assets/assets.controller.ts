import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  ASSET_CLASSES,
  ASSET_CLASS_LABEL,
  ASSET_SUBTYPES,
  ASSET_SUBTYPE_LABEL,
  BUYER_CATEGORIES,
  BUYER_CATEGORY_LABEL,
  DILIGENCE_STAGE_LABEL,
  FACT_STATUSES,
  FACT_STATUS_LABEL,
  OPERATOR_ONLY_SUBTYPES,
  PROPERTY_FACTS,
  SOURCING_COVERAGE,
  diligenceItemsFor,
} from '@halo/shared';
import { AuthGuard } from '../auth/auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CurrentAccountId, CurrentUserId } from '../auth/decorators';
import { input } from '../disposition/parse-input';
import { DATA_WRITE } from '../data/data.controller';
import { PrismaService } from '../prisma.service';
import { PropertyIntelligenceService } from './property-intelligence.service';

const AssetClassSchema = z
  .object({
    assetClass: z.enum(ASSET_CLASSES).nullable(),
    subtype: z.string().trim().max(40).nullable().optional(),
    reason: z.string().trim().max(500).nullable().optional(),
  })
  .strict();

const FactSchema = z
  .object({
    key: z.string().trim().min(1).max(60),
    value: z
      .union([z.number().finite(), z.boolean(), z.string().trim().max(2000)])
      .nullable(),
    status: z.enum(FACT_STATUSES),
    source: z.string().trim().max(200).nullable().optional(),
    sourceUrl: z.string().trim().url().max(1000).nullable().optional(),
    documentId: z.string().trim().max(64).nullable().optional(),
    note: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

const MappingSchema = z
  .object({
    state: z.string().trim().length(2),
    county: z.string().trim().max(80).nullable().optional(),
    provider: z.string().trim().max(40).nullable().optional(),
    code: z.string().trim().min(1).max(60),
    assetClass: z.enum(ASSET_CLASSES),
    subtype: z.string().trim().max(40).nullable().optional(),
  })
  .strict();

/** Asset classes, property facts and public-record checks (docs/asset-classes.md). */
@Controller()
@UseGuards(AuthGuard, PermissionsGuard)
export class AssetsController {
  constructor(
    private intelligence: PropertyIntelligenceService,
    private prisma: PrismaService,
  ) {}

  /** The vocabulary the screens use: classes, subtypes, facts, diligence, buyer categories, provider coverage. */
  @Get('assets/taxonomy')
  taxonomy() {
    return {
      classes: ASSET_CLASSES.map((c) => ({
        key: c,
        label: ASSET_CLASS_LABEL[c],
        subtypes: ASSET_SUBTYPES[c].map((s) => ({
          key: s,
          label: ASSET_SUBTYPE_LABEL[s],
          operatorOnly: OPERATOR_ONLY_SUBTYPES.includes(s),
        })),
        diligence: diligenceItemsFor(c).map((d) => ({
          ...d,
          stageLabel: DILIGENCE_STAGE_LABEL[d.stage],
        })),
      })),
      facts: PROPERTY_FACTS,
      factStatuses: FACT_STATUSES.map((s) => ({
        key: s,
        label: FACT_STATUS_LABEL[s],
      })),
      buyerCategories: BUYER_CATEGORIES.map((c) => ({
        key: c,
        label: BUYER_CATEGORY_LABEL[c],
      })),
      sourcingCoverage: SOURCING_COVERAGE,
    };
  }

  @Get('properties/:id/asset')
  view(
    @CurrentAccountId() a: string,
    @Param('id') id: string,
    @Query('dealId') dealId?: string,
  ) {
    return this.intelligence.view(a, id, dealId || null);
  }

  @Put('properties/:id/asset-class')
  @Permissions(DATA_WRITE)
  setAssetClass(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intelligence.setAssetClass(
      a,
      id,
      u,
      input(AssetClassSchema, body),
    );
  }

  @Post('properties/:id/facts')
  @Permissions(DATA_WRITE)
  recordFact(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.intelligence.recordFact(a, id, u, input(FactSchema, body));
  }

  /** FEMA flood zones and mapped wetlands. Free public maps, but an outside call. */
  @Post('properties/:id/public-records')
  @Permissions(DATA_WRITE)
  checkPublicRecords(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Param('id') id: string,
  ) {
    return this.intelligence.checkPublicRecords(a, id, u);
  }

  @Get('asset-code-mappings')
  mappings(@CurrentAccountId() a: string) {
    return this.prisma.assetCodeMapping.findMany({
      where: { accountId: a },
      orderBy: [{ state: 'asc' }, { code: 'asc' }],
    });
  }

  @Post('asset-code-mappings')
  @Permissions(DATA_WRITE)
  addMapping(
    @CurrentAccountId() a: string,
    @CurrentUserId() u: string,
    @Body() body: unknown,
  ) {
    return this.intelligence.addCodeMapping(a, u, input(MappingSchema, body));
  }
}
