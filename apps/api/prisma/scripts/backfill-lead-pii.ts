/* eslint-disable no-console */
// Idempotent backfill for the PII dual-write phase: encrypt and hash contact
// fields on leads that still only have plaintext. Safe to re-run; stops when
// nothing is left. Requires PII_ENCRYPTION_KEY_V1 and PII_INDEX_KEY.
//
//   npm run db:backfill-pii            (from the repo root)
import { PrismaClient } from '@prisma/client';
import { needsProtection, protectContact } from '../../src/leads/lead-pii';

const prisma = new PrismaClient();
const BATCH = 500;

async function main() {
  let done = 0;
  for (;;) {
    const rows = await prisma.lead.findMany({
      where: {
        OR: [
          { canonicalPhone: { not: null }, canonicalPhoneEnc: null },
          { canonicalEmail: { not: null }, canonicalEmailEnc: null },
        ],
      },
      select: {
        id: true,
        canonicalPhone: true,
        canonicalEmail: true,
        canonicalPhoneEnc: true,
        canonicalEmailEnc: true,
      },
      take: BATCH,
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (!needsProtection(row)) continue;
      const data = protectContact({
        phone: row.canonicalPhoneEnc ? undefined : row.canonicalPhone,
        email: row.canonicalEmailEnc ? undefined : row.canonicalEmail,
      });
      await prisma.lead.update({ where: { id: row.id }, data });
      done++;
    }
    console.log(`backfilled ${done} leads so far`);
  }
  console.log(`done: ${done} leads protected`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
