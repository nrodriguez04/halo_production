/**
 * Do Not Call registry data on a real database (docs/communications.md s7):
 * a downloaded file imported in bulk, numbers matched at send time, coverage
 * by area code and age, and an import retiring the one it replaces.
 * Every number is SYNTHETIC (555-01xx).
 */
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { TestingModule } from '@nestjs/testing';
import { USER, buildModule, describeDb, fixtures } from './harness';
import { PrismaService } from '../../src/prisma.service';
import { DncRegistryService } from '../../src/compliance/dnc-registry.service';
import { ComplianceService } from '../../src/compliance/compliance.service';

const dir = mkdtempSync(join(tmpdir(), 'dnc-'));
function file(name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join('\r\n'));
  return path;
}

describeDb('Do Not Call registry (synthetic, real database)', () => {
  let moduleRef: TestingModule;
  let fx: ReturnType<typeof fixtures>;
  let prisma: PrismaService;

  beforeAll(async () => {
    moduleRef = await buildModule();
    fx = fixtures(moduleRef);
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    if (!prisma) return;
    await fx.cleanup();
    await moduleRef?.close();
  });

  it('imports a download, matches numbers, and covers only its area codes for 31 days', async () => {
    const registry = moduleRef.get(DncRegistryService);
    const compliance = moduleRef.get(ComplianceService);
    const accountId = await fx.tenant();

    expect(await registry.check(accountId, '2145550100')).toBe('not_covered');

    const first = await registry.import(accountId, USER, {
      filePath: file('first.txt', [
        '2145550100',
        '1-214-555-0101',
        '(972) 555 0102',
        '3125550103',
        'not a number',
        '',
      ]),
      fileName: 'first.txt',
      source: 'national',
      areaCodes: ['972', '214'],
      fetchedAt: new Date(),
    });
    expect(first).toMatchObject({
      numbers: 3,
      skipped: 2,
      areaCodes: ['214', '972'],
      retired: 0,
    });

    expect(await registry.check(accountId, '+1 214 555 0100')).toBe('listed');
    expect(await registry.check(accountId, '(972) 555-0102')).toBe('listed');
    expect(await registry.check(accountId, '2145550199')).toBe('clear');
    // 312 was in the file but not subscribed: not covered.
    expect(await registry.check(accountId, '3125550103')).toBe('not_covered');
    // Another tenant's data covers nothing here.
    expect(await registry.check(await fx.tenant(), '2145550100')).toBe(
      'not_covered',
    );

    const facts = await compliance.getFacts({
      accountId,
      channel: 'sms',
      phone: '2145550100',
    });
    expect(facts).toMatchObject({
      dncRegistry: 'listed',
      dncRegistryRequired: true,
      writtenConsent: false,
    });

    // A fresh download of the same area codes replaces the first.
    const second = await registry.import(accountId, USER, {
      filePath: file('second.txt', ['2145550111']),
      source: 'national',
      areaCodes: ['214', '972'],
      fetchedAt: new Date(),
    });
    expect(second.retired).toBe(1);
    expect(await registry.check(accountId, '2145550100')).toBe('clear');
    expect(await registry.check(accountId, '2145550111')).toBe('listed');
    expect(
      await prisma.dncRegistryNumber.count({ where: { listId: first.id } }),
    ).toBe(0);

    // Data older than 31 days covers nothing, so it is refused at import.
    await expect(
      registry.import(accountId, USER, {
        filePath: file('stale.txt', ['2145550100']),
        source: 'national',
        areaCodes: ['214'],
        fetchedAt: new Date(Date.now() - 40 * 86_400_000),
      }),
    ).rejects.toThrow(/older than 31 days/);

    // A state list adds numbers but does not cover an area code by itself.
    await registry.import(accountId, USER, {
      filePath: file('tx.txt', ['4695550120']),
      source: 'TX',
      areaCodes: ['469'],
      fetchedAt: new Date(),
    });
    expect(await registry.check(accountId, '4695550120')).toBe('not_covered');

    const status = await registry.status(accountId);
    expect(status.required).toBe(true);
    expect(status.coveredAreaCodes).toEqual(['214', '972']);
    expect(status.lists.map((l) => l.source).sort()).toEqual([
      'TX',
      'national',
    ]);

    await registry.setRequired(
      accountId,
      USER,
      false,
      'SYNTHETIC: counsel says registry scrubbing does not apply',
    );
    expect(await registry.required(accountId)).toBe(false);
  });
});
