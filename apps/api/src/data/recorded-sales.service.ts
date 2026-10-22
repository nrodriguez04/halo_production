import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  guessSaleColumns,
  parseCsv,
  partyKey,
  saleFromCountyRow,
  salesFromAttomHistory,
  toJurisdictionCode,
  type NormalizedSale,
  type PartyKind,
  type DataQuality,
} from '@halo/shared';
import type { Readable } from 'stream';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { DocumentsService } from '../documents/documents.service';
import { AttomService } from '../integrations/attom/attom.service';

const MAX_ROWS = 200_000;
const CHUNK = 1_000;

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream)
    chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

type SaleRow = Prisma.RecordedSaleGetPayload<object>;

/** A stored sale back in the provider-neutral shape. */
export function toNormalized(r: SaleRow): NormalizedSale {
  return {
    source: r.source,
    sourceRef: r.sourceRef,
    state: r.state,
    county: r.county,
    countyFips: r.countyFips,
    city: r.city,
    zip: r.zip,
    address: r.address,
    apn: r.apn,
    saleDate: r.saleDate.toISOString().slice(0, 10),
    price: r.price,
    buyerName: r.buyerName,
    buyerKind: r.buyerKind as PartyKind | null,
    buyerMailingZip: r.buyerMailingZip,
    sellerName: r.sellerName,
    sellerKind: r.sellerKind as PartyKind | null,
    cashPurchase: r.cashPurchase,
    armsLength: r.armsLength,
    deedType: r.deedType,
    propertyType: r.propertyType,
    quality: r.quality as DataQuality,
  };
}

/**
 * Recorded sales from any source, in one table (docs/data-pipeline.md s3):
 * county exports the operator is authorized to use, ATTOM sales history
 * and area snapshots. Re-importing the same record is a no-op.
 */
@Injectable()
export class RecordedSalesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private documents: DocumentsService,
    private attom: AttomService,
  ) {}

  async ingest(
    accountId: string,
    sales: NormalizedSale[],
    importId?: string,
  ): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < sales.length; i += CHUNK) {
      const batch = sales.slice(i, i + CHUNK).map((s) => ({
        accountId,
        source: s.source,
        sourceRef: s.sourceRef,
        state: s.state,
        county: s.county,
        countyFips: s.countyFips,
        city: s.city,
        zip: s.zip,
        address: s.address,
        apn: s.apn,
        saleDate: new Date(`${s.saleDate}T00:00:00Z`),
        price: s.price,
        buyerName: s.buyerName,
        buyerKind: s.buyerKind,
        buyerKey: partyKey(s.buyerName, s.buyerMailingZip),
        buyerMailingZip: s.buyerMailingZip,
        sellerName: s.sellerName,
        sellerKind: s.sellerKind,
        sellerKey: partyKey(s.sellerName, null),
        cashPurchase: s.cashPurchase,
        armsLength: s.armsLength,
        deedType: s.deedType,
        propertyType: s.propertyType,
        quality: s.quality,
        importId: importId ?? null,
      }));
      const res = await this.prisma.recordedSale.createMany({
        data: batch,
        skipDuplicates: true,
      });
      inserted += res.count;
    }
    return inserted;
  }

  private async csvText(accountId: string, documentId: string) {
    const doc = await this.documents.get(accountId, documentId);
    if (!/\.(csv|txt)$/i.test(doc.fileName)) {
      throw new BadRequestException('Upload the county export as a .csv file.');
    }
    const { body } = await this.documents.download(accountId, documentId);
    return (await readAll(body)).toString('utf8');
  }

  /** The file's columns, a few rows, and a first guess at which column is which. */
  async previewCsv(accountId: string, documentId: string) {
    const { headers, rows } = parseCsv(
      await this.csvText(accountId, documentId),
      { maxRows: 5 },
    );
    return { headers, sample: rows, guess: guessSaleColumns(headers) };
  }

  /**
   * Import a county recorded-sales export the operator is authorized to
   * use, through the column mapping they confirmed. Rows without a
   * reference, a date or a state are skipped and counted.
   */
  async importCsv(
    accountId: string,
    userId: string,
    input: {
      documentId: string;
      state: string;
      county?: string | null;
      countyFips?: string | null;
      source?: string;
      mapping: Record<string, string>;
    },
  ) {
    const state = toJurisdictionCode(input.state);
    if (!state)
      throw new BadRequestException(
        `"${input.state}" is not one of the 50 states or DC.`,
      );
    if (!input.mapping.sourceRef || !input.mapping.saleDate) {
      throw new BadRequestException(
        'Map at least the record reference and the sale date columns.',
      );
    }
    const { headers, rows } = parseCsv(
      await this.csvText(accountId, input.documentId),
      { maxRows: MAX_ROWS },
    );
    const missing = Object.values(input.mapping).filter(
      (h) => h && !headers.includes(h),
    );
    if (missing.length)
      throw new BadRequestException(
        `The file has no column named: ${missing.join(', ')}.`,
      );
    const source = input.source?.trim() || 'county_csv';
    const sales: NormalizedSale[] = [];
    let skipped = 0;
    for (const row of rows) {
      const s = saleFromCountyRow(row, input.mapping as never, {
        source,
        state,
        county: input.county ?? null,
        countyFips: input.countyFips ?? null,
      });
      if (s) sales.push(s);
      else skipped += 1;
    }
    const batch = await this.prisma.dataImport.create({
      data: {
        accountId,
        kind: 'recorded_sales',
        source,
        documentId: input.documentId,
        state,
        county: input.county ?? null,
        params: {
          mapping: input.mapping,
          countyFips: input.countyFips ?? null,
        } as Prisma.InputJsonObject,
        rows: rows.length,
        skipped,
        createdBy: userId,
      },
    });
    const imported = await this.ingest(accountId, sales, batch.id);
    await this.prisma.dataImport.update({
      where: { id: batch.id },
      data: { imported },
    });
    await this.audit.log({
      accountId,
      userId,
      action: 'data.recorded_sales.import',
      resource: `data_import:${batch.id}`,
      details: {
        documentId: input.documentId,
        state,
        rows: rows.length,
        imported,
        skipped,
        duplicates: sales.length - imported,
      },
    });
    return {
      importId: batch.id,
      rows: rows.length,
      imported,
      duplicates: sales.length - imported,
      skipped,
    };
  }

  /** Recorded sales of one property from ATTOM. A paid call. */
  async pullAttomHistory(accountId: string, userId: string, address: string) {
    const out = await this.attom.salesHistory(address, {
      accountId,
      actor: 'user',
      userId,
    });
    const sales = salesFromAttomHistory(out.data);
    const imported = await this.ingest(accountId, sales);
    return {
      found: sales.length,
      imported,
      costUsd: out.costUsd,
      cached: out.cached,
    };
  }

  /** An area's recorded sales from ATTOM, page by page, up to `maxPages`. Paid calls. */
  async pullAttomArea(
    accountId: string,
    userId: string,
    q: {
      postalCode: string;
      startDate: string;
      endDate: string;
      maxPages: number;
    },
  ) {
    let found = 0;
    let imported = 0;
    let cost = 0;
    let pages = 0;
    for (let page = 1; page <= q.maxPages; page++) {
      const out = await this.attom.salesSnapshot(
        { ...q, page },
        { accountId, actor: 'user', userId },
      );
      pages = page;
      cost += out.costUsd;
      const sales = salesFromAttomHistory(out.data);
      found += sales.length;
      imported += await this.ingest(accountId, sales);
      if (sales.length < 100) break;
    }
    await this.audit.log({
      accountId,
      userId,
      action: 'data.recorded_sales.attom_area',
      resource: `zip:${q.postalCode}`,
      details: { ...q, pages, found, imported, costUsd: cost },
    });
    return { pages, found, imported, costUsd: cost };
  }

  async list(
    accountId: string,
    q: {
      state?: string;
      zip?: string;
      countyFips?: string;
      buyerKey?: string;
      limit?: number;
    },
  ) {
    return this.prisma.recordedSale.findMany({
      where: {
        accountId,
        ...(q.state ? { state: q.state } : {}),
        ...(q.zip ? { zip: q.zip } : {}),
        ...(q.countyFips ? { countyFips: q.countyFips } : {}),
        ...(q.buyerKey ? { buyerKey: q.buyerKey } : {}),
      },
      orderBy: { saleDate: 'desc' },
      take: Math.min(q.limit ?? 100, 500),
    });
  }

  async summary(accountId: string) {
    const [byState, imports, total] = await Promise.all([
      this.prisma.recordedSale.groupBy({
        by: ['state', 'source'],
        where: { accountId },
        _count: { _all: true },
        _max: { saleDate: true },
      }),
      this.prisma.dataImport.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.recordedSale.count({ where: { accountId } }),
    ]);
    return {
      total,
      byState: byState.map((g) => ({
        state: g.state,
        source: g.source,
        sales: g._count._all,
        latest: g._max.saleDate,
      })),
      imports,
    };
  }
}
