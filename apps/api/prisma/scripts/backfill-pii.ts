/* eslint-disable no-console */
// Idempotent backfill for contact PII at rest (docs/pii-encryption-design.md).
// Encrypts and blind-indexes every contact still stored in plaintext, and
// seals or scrubs the JSON copies. Safe to re-run: each step only touches
// rows that still need it. Uses raw SQL and checks for each column, so it
// works on either side of the cutover migrations.
//
//   npm run db:backfill-pii            (from the repo root)
//
// Needs the api's PII_ENCRYPTION_KEY_V<n>, PII_ENCRYPTION_KEY_CURRENT_VERSION
// and PII_INDEX_KEY. Run it after 20261010120000_contact_pii_columns and
// before 20261010120100_drop_plaintext_contacts, which refuses to run until
// it has.
import { Prisma, PrismaClient } from '@prisma/client';
import { redactContactDetails } from '@halo/shared';
import { protectContact } from '../../src/leads/lead-pii';
import {
  isSealedJson,
  protectEmail,
  protectPhone,
  sealJson,
} from '../../src/pii/contact-crypto';
import {
  counterpartyColumns,
  recipientFromMetadata,
} from '../../src/communications/message-counterparty';

const prisma = new PrismaClient();
const BATCH = 500;
const SKIP_TRACE_PROVIDERS = ['batch_skiptrace', 'datazapp', 'stub_skiptrace'];

type Json = Record<string, unknown>;

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

/**
 * dnc_list.phone -> phoneEnc / phoneHash. A blank phone matches no recipient
 * and cannot be indexed, so such a row is deleted rather than carried over.
 */
async function backfillDnc(): Promise<number> {
  if (!(await columnsExist('dnc_list', ['phone', 'phoneEnc']))) return 0;
  const blank = await prisma.$executeRaw`
    DELETE FROM "dnc_list" WHERE "phone" IS NOT NULL AND btrim("phone") = ''`;
  if (blank) console.log(`dnc_list: removed ${blank} entries with a blank phone`);
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; phone: string }[]>`
      SELECT "id", "phone" FROM "dnc_list"
      WHERE "id" > ${after}
        AND "phone" IS NOT NULL AND ("phoneEnc" IS NULL OR "phoneHash" IS NULL)
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      const p = protectPhone(row.phone);
      await prisma.$executeRaw`UPDATE "dnc_list" SET "phoneEnc" = ${p.phoneEnc}, "phoneHash" = ${p.phoneHash} WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** consents.phone / consents.email -> *Enc / *Hash; blank values are cleared. */
async function backfillConsents(): Promise<number> {
  if (!(await columnsExist('consents', ['phone', 'email', 'phoneEnc', 'emailEnc']))) return 0;
  return backfillContactColumns('consents');
}

/** buyers.email / buyers.phone -> *Enc / *Hash; blank values are cleared. */
async function backfillBuyers(): Promise<number> {
  if (!(await columnsExist('buyers', ['email', 'phone', 'emailEnc', 'phoneEnc']))) return 0;
  return backfillContactColumns('buyers');
}

/**
 * Shared by consents and buyers, which use the same column names. A blank
 * string is not a contact: it is cleared rather than encrypted, so the row
 * stops matching and the drop migration's guard passes.
 */
async function backfillContactColumns(table: 'consents' | 'buyers'): Promise<number> {
  const t = Prisma.raw(`"${table}"`);
  await prisma.$executeRaw`UPDATE ${t} SET "phone" = NULL WHERE "phone" IS NOT NULL AND btrim("phone") = ''`;
  await prisma.$executeRaw`UPDATE ${t} SET "email" = NULL WHERE "email" IS NOT NULL AND btrim("email") = ''`;
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<
      { id: string; phone: string | null; email: string | null; phoneEnc: string | null; emailEnc: string | null }[]
    >`
      SELECT "id", "phone", "email", "phoneEnc", "emailEnc" FROM ${t}
      WHERE "id" > ${after}
        AND (("phone" IS NOT NULL AND "phoneEnc" IS NULL)
          OR ("email" IS NOT NULL AND "emailEnc" IS NULL))
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
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
      await prisma.$executeRaw`UPDATE ${t} SET ${Prisma.join(sets, ', ')} WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** messages: metadata.to/phone/email/from -> counterpartyEnc/Hash, keys stripped */
async function backfillMessages(): Promise<number> {
  if (!(await columnsExist('messages', ['counterpartyEnc', 'counterpartyHash']))) return 0;
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<
      { id: string; channel: string; direction: string; metadata: Json | null }[]
    >`
      SELECT "id", "channel", "direction", "metadata" FROM "messages"
      WHERE "id" > ${after}
        AND "counterpartyEnc" IS NULL
        AND "metadata" IS NOT NULL
        AND ("metadata" ? 'to' OR "metadata" ? 'phone' OR "metadata" ? 'email' OR "metadata" ? 'from')
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
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

/**
 * lead_enrichment_jobs.metadata.skipTrace: the worker used to persist the
 * traced phone and email in plaintext. Replace them with ciphertext and
 * found/not-found flags.
 */
async function backfillEnrichmentJobs(): Promise<number> {
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; skipTrace: Json }[]>`
      SELECT "id", "metadata" -> 'skipTrace' AS "skipTrace" FROM "lead_enrichment_jobs"
      WHERE "id" > ${after}
        AND jsonb_typeof("metadata" -> 'skipTrace') = 'object'
        AND ("metadata" -> 'skipTrace') ?| array['phone', 'email']
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      const { phone, email, ...rest } = row.skipTrace;
      const phoneValue = typeof phone === 'string' && phone.trim() ? phone : null;
      const emailValue = typeof email === 'string' && email.trim() ? email : null;
      const next: Json = {
        ...rest,
        phoneFound: Boolean(rest.phoneFound) || !!phoneValue,
        emailFound: Boolean(rest.emailFound) || !!emailValue,
        ...(phoneValue ? { phoneEnc: protectPhone(phoneValue).phoneEnc } : {}),
        ...(emailValue ? { emailEnc: protectEmail(emailValue).emailEnc } : {}),
      };
      await prisma.$executeRaw`
        UPDATE "lead_enrichment_jobs"
        SET "metadata" = jsonb_set("metadata", '{skipTrace}', ${JSON.stringify(next)}::jsonb)
        WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** source_records: PropertyRadar contact responses, sealed with counts kept. */
async function backfillSourceRecords(): Promise<number> {
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; endpoint: string; response: unknown }[]>`
      SELECT "id", "endpoint", "response" FROM "source_records"
      WHERE "id" > ${after}
        AND "provider" = 'propertyradar'
        AND "endpoint" LIKE '/properties/%/contacts'
        AND NOT (jsonb_typeof("response") = 'object' AND "response" ? 'sealedPii')
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      const data = (row.response ?? {}) as Json;
      const radarId =
        typeof data.RadarID === 'string'
          ? data.RadarID
          : row.endpoint.split('/')[2] ?? null;
      const sealed = sealJson(row.response, {
        RadarID: radarId,
        phoneCount: Array.isArray(data.Phones) ? data.Phones.length : 0,
        emailCount: Array.isArray(data.Emails) ? data.Emails.length : 0,
      });
      await prisma.$executeRaw`
        UPDATE "source_records" SET "response" = ${JSON.stringify(sealed)}::jsonb
        WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/** cached_provider_responses: skip-trace contact payloads, sealed in place. */
async function backfillCachedResponses(): Promise<number> {
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; payload: unknown }[]>`
      SELECT "id", "payload" FROM "cached_provider_responses"
      WHERE "id" > ${after}
        AND NOT (jsonb_typeof("payload") = 'object' AND "payload" ? 'sealedPii')
        AND (
          "providerKey" = ANY(${SKIP_TRACE_PROVIDERS})
          OR ("providerKey" = 'propertyradar'
              AND jsonb_typeof("payload" -> 'data') = 'object'
              AND ("payload" -> 'data') ?| array['Phones', 'Emails'])
        )
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      if (isSealedJson(row.payload)) continue;
      await prisma.$executeRaw`
        UPDATE "cached_provider_responses"
        SET "payload" = ${JSON.stringify(sealJson(row.payload))}::jsonb
        WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

/**
 * Provider error text that quoted a recipient: the cost ledger's
 * metadata.error and the worker's send-failure timeline payloads.
 */
async function redactStoredErrors(): Promise<number> {
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; error: string }[]>`
      SELECT "id", "metadata" ->> 'error' AS "error" FROM "integration_cost_events"
      WHERE "id" > ${after} AND jsonb_typeof("metadata" -> 'error') = 'string'
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      const redacted = redactContactDetails(row.error);
      if (redacted === row.error) continue;
      await prisma.$executeRaw`
        UPDATE "integration_cost_events"
        SET "metadata" = jsonb_set("metadata", '{error}', to_jsonb(${redacted}::text))
        WHERE "id" = ${row.id}`;
      done++;
    }
  }

  after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; payload: Json }[]>`
      SELECT "id", "payloadJson" AS "payload" FROM "timeline_events"
      WHERE "id" > ${after}
        AND "eventType" IN ('MESSAGE_SEND_FAILED', 'MESSAGE_SEND_BLOCKED')
        AND jsonb_typeof("payloadJson") = 'object'
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;
    for (const row of rows) {
      after = row.id;
      const next: Json = { ...row.payload };
      for (const key of ['error', 'message']) {
        if (typeof next[key] === 'string') {
          next[key] = redactContactDetails(next[key] as string);
        }
      }
      if (JSON.stringify(next) === JSON.stringify(row.payload)) continue;
      await prisma.$executeRaw`
        UPDATE "timeline_events" SET "payloadJson" = ${JSON.stringify(next)}::jsonb
        WHERE "id" = ${row.id}`;
      done++;
    }
  }
  return done;
}

async function backfillLeads(): Promise<number | null> {
  if (!(await plaintextColumnsExist())) return null;
  let done = 0;
  let after = '';
  for (;;) {
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "id", "canonicalPhone", "canonicalEmail", "canonicalPhoneEnc", "canonicalEmailEnc"
      FROM "leads"
      WHERE "id" > ${after}
        AND (("canonicalPhone" IS NOT NULL AND "canonicalPhoneEnc" IS NULL)
          OR ("canonicalEmail" IS NOT NULL AND "canonicalEmailEnc" IS NULL))
      ORDER BY "id" LIMIT ${BATCH}`;
    if (rows.length === 0) break;

    for (const row of rows) {
      after = row.id;
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
  return done;
}

async function main() {
  console.log(`messages: ${await backfillMessages()} rows protected`);
  console.log(`dnc_list: ${await backfillDnc()} rows protected`);
  console.log(`consents: ${await backfillConsents()} rows protected`);
  console.log(`buyers: ${await backfillBuyers()} rows protected`);
  console.log(`lead_enrichment_jobs: ${await backfillEnrichmentJobs()} rows protected`);
  console.log(`source_records: ${await backfillSourceRecords()} contact responses sealed`);
  console.log(`cached_provider_responses: ${await backfillCachedResponses()} contact payloads sealed`);
  console.log(`error text: ${await redactStoredErrors()} rows redacted`);
  const leads = await backfillLeads();
  console.log(
    leads === null
      ? 'leads: nothing to backfill, the plaintext contact columns are already dropped'
      : `leads: ${leads} rows protected`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
