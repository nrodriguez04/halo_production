/* eslint-disable no-console */
// Idempotent backfill from the dual-write phase: encrypt and hash contact
// fields on leads that still only have plaintext. Uses raw SQL so it keeps
// working on either side of the cutover migration: once the plaintext
// columns are gone it reports that and exits.
//
//   npm run db:backfill-pii            (from the repo root)
import { Prisma, PrismaClient } from '@prisma/client';
import { protectContact } from '../../src/leads/lead-pii';

const prisma = new PrismaClient();
const BATCH = 500;

type Row = {
  id: string;
  canonicalPhone: string | null;
  canonicalEmail: string | null;
  canonicalPhoneEnc: string | null;
  canonicalEmailEnc: string | null;
};

async function plaintextColumnsExist(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name IN ('canonicalPhone', 'canonicalEmail')`;
  return Number(rows[0]?.n ?? 0) === 2;
}

async function main() {
  if (!(await plaintextColumnsExist())) {
    console.log(
      'nothing to backfill: the plaintext contact columns have already been dropped',
    );
    return;
  }
  let done = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id", "canonicalPhone", "canonicalEmail", "canonicalPhoneEnc", "canonicalEmailEnc"
      FROM "leads"
      WHERE ("canonicalPhone" IS NOT NULL AND "canonicalPhoneEnc" IS NULL)
         OR ("canonicalEmail" IS NOT NULL AND "canonicalEmailEnc" IS NULL)
      LIMIT ${BATCH}`;
    if (rows.length === 0) break;

    for (const row of rows) {
      const data = protectContact({
        phone: row.canonicalPhoneEnc ? undefined : row.canonicalPhone,
        email: row.canonicalEmailEnc ? undefined : row.canonicalEmail,
      });
      const sets: Prisma.Sql[] = [];
      if (data.canonicalPhoneEnc !== undefined) {
        sets.push(Prisma.sql`"canonicalPhoneEnc" = ${data.canonicalPhoneEnc}`);
        sets.push(Prisma.sql`"canonicalPhoneHash" = ${data.canonicalPhoneHash}`);
      }
      if (data.canonicalEmailEnc !== undefined) {
        sets.push(Prisma.sql`"canonicalEmailEnc" = ${data.canonicalEmailEnc}`);
        sets.push(Prisma.sql`"canonicalEmailHash" = ${data.canonicalEmailHash}`);
      }
      if (sets.length === 0) continue;
      await prisma.$executeRaw`UPDATE "leads" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${row.id}`;
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
