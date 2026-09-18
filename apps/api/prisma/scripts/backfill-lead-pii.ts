/* eslint-disable no-console */
// Idempotent backfill from the dual-write phase: encrypt and hash contact
// fields on leads that still only have plaintext. Uses raw SQL so it keeps
// working on either side of the cutover migration: once the plaintext
// columns are gone it reports that and exits.
//
//   npm run db:backfill-pii            (from the repo root)
import { Prisma, PrismaClient } from '@prisma/client';
import { protectContact } from '../../src/leads/lead-pii';
import { protectEmail, protectPhone } from '../../src/pii/contact-crypto';
import {
  counterpartyColumns,
  recipientFromMetadata,
} from '../../src/communications/message-counterparty';

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

async function columnsExist(table: string, columns: string[]): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM information_schema.columns
    WHERE table_name = ${table} AND column_name = ANY(${columns})`;
  return Number(rows[0]?.n ?? 0) === columns.length;
}

/** dnc_list.phone -> phoneEnc / phoneHash */
async function backfillDnc(): Promise<number> {
  if (!(await columnsExist('dnc_list', ['phone', 'phoneEnc']))) return 0;
  let done = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; phone: string }[]>`
      SELECT "id", "phone" FROM "dnc_list"
      WHERE "phone" IS NOT NULL AND "phoneEnc" IS NULL LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      const p = protectPhone(row.phone);
      await prisma.$executeRaw`UPDATE "dnc_list" SET "phoneEnc" = ${p.phoneEnc}, "phoneHash" = ${p.phoneHash} WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** consents.phone / consents.email -> *Enc / *Hash */
async function backfillConsents(): Promise<number> {
  if (!(await columnsExist('consents', ['phone', 'email', 'phoneEnc', 'emailEnc']))) return 0;
  let done = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<
      { id: string; phone: string | null; email: string | null; phoneEnc: string | null; emailEnc: string | null }[]
    >`
      SELECT "id", "phone", "email", "phoneEnc", "emailEnc" FROM "consents"
      WHERE ("phone" IS NOT NULL AND "phoneEnc" IS NULL)
         OR ("email" IS NOT NULL AND "emailEnc" IS NULL) LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      const sets: Prisma.Sql[] = [];
      if (row.phone && !row.phoneEnc) {
        const p = protectPhone(row.phone);
        sets.push(Prisma.sql`"phoneEnc" = ${p.phoneEnc}`, Prisma.sql`"phoneHash" = ${p.phoneHash}`);
      }
      if (row.email && !row.emailEnc) {
        const e = protectEmail(row.email);
        sets.push(Prisma.sql`"emailEnc" = ${e.emailEnc}`, Prisma.sql`"emailHash" = ${e.emailHash}`);
      }
      if (sets.length === 0) continue;
      await prisma.$executeRaw`UPDATE "consents" SET ${Prisma.join(sets, ', ')} WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** messages: metadata.to/phone/email/from -> counterpartyEnc/Hash, keys stripped */
async function backfillMessages(): Promise<number> {
  if (!(await columnsExist('messages', ['counterpartyEnc', 'counterpartyHash']))) return 0;
  let done = 0;
  for (;;) {
    const rows = await prisma.$queryRaw<
      { id: string; channel: string; direction: string; metadata: Record<string, unknown> | null }[]
    >`
      SELECT "id", "channel", "direction", "metadata" FROM "messages"
      WHERE "counterpartyEnc" IS NULL
        AND "metadata" IS NOT NULL
        AND ("metadata" ? 'to' OR "metadata" ? 'phone' OR "metadata" ? 'email' OR "metadata" ? 'from')
      LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      const value = recipientFromMetadata(
        row.channel,
        row.metadata,
        row.direction === 'inbound' ? 'inbound' : 'outbound',
      );
      const cols = counterpartyColumns(row.channel, value);
      // Strip the plaintext keys whether or not a value was found, so the
      // same row is not re-read on the next pass; keep the rest of metadata.
      await prisma.$executeRaw`
        UPDATE "messages"
        SET "counterpartyEnc" = ${cols.counterpartyEnc},
            "counterpartyHash" = ${cols.counterpartyHash},
            "metadata" = ("metadata" - 'to' - 'phone' - 'email' - 'from')
        WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

async function main() {
  console.log(`messages: ${await backfillMessages()} rows protected`);
  console.log(`dnc_list: ${await backfillDnc()} rows protected`);
  console.log(`consents: ${await backfillConsents()} rows protected`);
  if (!(await plaintextColumnsExist())) {
    console.log(
      'leads: nothing to backfill, the plaintext contact columns are already dropped',
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
  console.log(`leads: ${done} rows protected`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
