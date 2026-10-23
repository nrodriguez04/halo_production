import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit/audit.service';
import { GLOBAL_ACCOUNT_ID } from '../control-plane/control-plane.service';

/**
 * Do Not Call registry data (docs/communications.md s7).
 *
 * An operator downloads the National Do Not Call Registry for the area codes
 * the account subscribed to (and any state list counsel requires) and
 * imports the files here. A marketing text is then checked against it at
 * send time. Coverage lasts 31 days from the download, the Telemarketing
 * Sales Rule's safe-harbor limit; after that the area code counts as not
 * covered and, while scrubbing is required, marketing texts to it stop.
 */

export const REGISTRY_MAX_AGE_DAYS = 31;
const DAY = 86_400_000;
const BATCH = 10_000;

export type RegistryStatus = 'listed' | 'clear' | 'not_covered';

/** A US number's ten digits, or null: "+1 (214) 555-0100" -> "2145550100". */
export function tenDigits(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : null;
}

export interface RegistryImport {
  filePath: string;
  fileName?: string | null;
  /** "national" or a two-letter state code. */
  source: string;
  areaCodes: string[];
  /** When the file was downloaded from the registry. */
  fetchedAt: Date;
}

@Injectable()
export class DncRegistryService {
  private readonly logger = new Logger(DncRegistryService.name);

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private freshSince(now = new Date()): Date {
    return new Date(now.getTime() - REGISTRY_MAX_AGE_DAYS * DAY);
  }

  /**
   * What the registry data on file says about one number. Covered means a
   * national list from the last 31 days includes its area code; a state
   * list adds numbers but never covers an area code on its own.
   */
  async check(
    accountId: string,
    phone: string | null | undefined,
  ): Promise<RegistryStatus> {
    const digits = tenDigits(phone);
    if (!digits) return 'not_covered';
    const lists = await this.prisma.dncRegistryList.findMany({
      where: {
        accountId: { in: [accountId, GLOBAL_ACCOUNT_ID] },
        fetchedAt: { gte: this.freshSince() },
        areaCodes: { has: digits.slice(0, 3) },
      },
      select: { id: true, source: true },
    });
    if (!lists.some((l) => l.source === 'national')) return 'not_covered';
    const hit = await this.prisma.dncRegistryNumber.findFirst({
      where: { listId: { in: lists.map((l) => l.id) }, phone: BigInt(digits) },
      select: { listId: true },
    });
    return hit ? 'listed' : 'clear';
  }

  /** Whether marketing texts must be scrubbed: on unless every applicable control-plane row turns it off. */
  async required(accountId: string): Promise<boolean> {
    const rows = await this.prisma.controlPlane.findMany({
      where: { accountId: { in: [accountId, GLOBAL_ACCOUNT_ID] } },
      select: { dncRegistryRequired: true },
    });
    return rows.length === 0 || rows.some((r) => r.dncRegistryRequired);
  }

  async status(accountId: string) {
    const now = new Date();
    const since = this.freshSince(now);
    const lists = await this.prisma.dncRegistryList.findMany({
      where: { accountId: { in: [accountId, GLOBAL_ACCOUNT_ID] } },
      orderBy: { fetchedAt: 'desc' },
    });
    const covered = new Set<string>();
    for (const l of lists) {
      if (l.source === 'national' && l.fetchedAt >= since)
        l.areaCodes.forEach((a) => covered.add(a));
    }
    return {
      required: await this.required(accountId),
      maxAgeDays: REGISTRY_MAX_AGE_DAYS,
      coveredAreaCodes: [...covered].sort(),
      lists: lists.map((l) => {
        const expiresAt = new Date(
          l.fetchedAt.getTime() + REGISTRY_MAX_AGE_DAYS * DAY,
        );
        return {
          id: l.id,
          source: l.source,
          areaCodes: l.areaCodes,
          fetchedAt: l.fetchedAt,
          expiresAt,
          current: l.fetchedAt >= since,
          numberCount: l.numberCount,
          skipped: l.skipped,
          fileName: l.fileName,
          importedAt: l.importedAt,
          shared: l.accountId === GLOBAL_ACCOUNT_ID,
        };
      }),
    };
  }

  /**
   * Imports one downloaded file: one number per line, ten digits (or
   * eleven with a leading 1), anything else on the line ignored. Numbers
   * outside the declared area codes are skipped and counted. A complete
   * import retires the account's older lists of the same source whose area
   * codes it covers.
   */
  async import(accountId: string, userId: string, input: RegistryImport) {
    const source = input.source.trim();
    if (source !== 'national' && !/^[A-Z]{2}$/.test(source)) {
      throw new BadRequestException(
        'source must be "national" or a two-letter state code',
      );
    }
    const areaCodes = [...new Set(input.areaCodes.map((a) => a.trim()))].sort();
    if (!areaCodes.length || areaCodes.some((a) => !/^[2-9]\d{2}$/.test(a))) {
      throw new BadRequestException(
        'List the three-digit area codes the file covers',
      );
    }
    const now = new Date();
    if (Number.isNaN(input.fetchedAt.getTime()) || input.fetchedAt > now) {
      throw new BadRequestException(
        'fetchedAt must be the date the file was downloaded, not later than today',
      );
    }
    if (input.fetchedAt < this.freshSince(now)) {
      throw new BadRequestException(
        `Registry data older than ${REGISTRY_MAX_AGE_DAYS} days covers nothing; download it again`,
      );
    }

    const wanted = new Set(areaCodes);
    const list = await this.prisma.dncRegistryList.create({
      data: {
        accountId,
        source,
        areaCodes,
        fetchedAt: input.fetchedAt,
        fileName: input.fileName ?? null,
        importedBy: userId,
      },
    });

    let numbers = 0;
    let skipped = 0;
    let batch: string[] = [];
    const flush = async () => {
      if (!batch.length) return;
      numbers += await this.prisma.$executeRaw(
        Prisma.sql`INSERT INTO dnc_registry_numbers ("listId", phone)
                   SELECT ${list.id}, unnest(${batch}::text[])::bigint
                   ON CONFLICT DO NOTHING`,
      );
      batch = [];
    };

    try {
      const lines = createInterface({
        input: createReadStream(input.filePath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (!line.trim()) continue;
        const digits = tenDigits(line);
        if (!digits || !wanted.has(digits.slice(0, 3))) {
          skipped++;
          continue;
        }
        batch.push(digits);
        if (batch.length >= BATCH) await flush();
      }
      await flush();
    } catch (err) {
      await this.prisma.dncRegistryList
        .delete({ where: { id: list.id } })
        .catch(() => undefined);
      this.logger.error(`Registry import failed: ${(err as Error).message}`);
      throw new BadRequestException(
        `The file could not be read: ${(err as Error).message}`,
      );
    }

    await this.prisma.dncRegistryList.update({
      where: { id: list.id },
      data: { numberCount: numbers, skipped },
    });

    const older = await this.prisma.dncRegistryList.findMany({
      where: {
        accountId,
        source,
        id: { not: list.id },
        fetchedAt: { lte: input.fetchedAt },
      },
      select: { id: true, areaCodes: true },
    });
    const retired = older
      .filter((o) => o.areaCodes.every((a) => wanted.has(a)))
      .map((o) => o.id);
    if (retired.length) {
      await this.prisma.dncRegistryList.deleteMany({
        where: { id: { in: retired } },
      });
    }

    await this.audit.log({
      accountId,
      userId,
      action: 'compliance.dnc_registry.import',
      resource: `dnc_registry:${list.id}`,
      details: {
        source,
        areaCodes,
        fetchedAt: input.fetchedAt.toISOString(),
        numbers,
        skipped,
        retired: retired.length,
      },
    });

    return {
      id: list.id,
      source,
      areaCodes,
      fetchedAt: input.fetchedAt,
      numbers,
      skipped,
      retired: retired.length,
    };
  }

  async remove(accountId: string, userId: string, id: string) {
    const list = await this.prisma.dncRegistryList.findFirst({
      where: { id, accountId },
    });
    if (!list) throw new BadRequestException('No such registry list');
    await this.prisma.dncRegistryList.delete({ where: { id } });
    await this.audit.log({
      accountId,
      userId,
      action: 'compliance.dnc_registry.remove',
      resource: `dnc_registry:${id}`,
      details: { source: list.source, areaCodes: list.areaCodes },
    });
    return { removed: id };
  }

  /** Turning scrubbing off is a decision for a person with counsel's answer; it is audited with the reason. */
  async setRequired(
    accountId: string,
    userId: string,
    required: boolean,
    reason: string,
  ) {
    await this.prisma.controlPlane.upsert({
      where: { accountId },
      create: { accountId, dncRegistryRequired: required, updatedBy: userId },
      update: { dncRegistryRequired: required, updatedBy: userId },
    });
    await this.audit.log({
      accountId,
      userId,
      action: required
        ? 'compliance.dnc_registry.require'
        : 'compliance.dnc_registry.not_required',
      resource: `control_plane:${accountId}`,
      details: { reason },
    });
    return this.status(accountId);
  }
}
