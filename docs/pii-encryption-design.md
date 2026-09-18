# PII encryption design

Status: **accepted 2026-09-18; Phase 1 (dual-write) merged in #93.**

Decisions taken (see "Decisions needed" at the end for the reasoning):

1. Owner name stays plaintext — public record, keeps trigram search.
2. Encrypted phone/email live inline on `leads` (`canonicalPhoneEnc` etc.), not in `PIIEnvelope`.
3. Phase 2 order: `messages.metadata` → `dnc_list` → `consents` → timeline/audit payload scrubbing.

Rollout tracker:

| step | state |
|---|---|
| additive columns, dual-write, blind-index lookups, `db:backfill-pii` | merged (#93) |
| cutover: drop plaintext columns, mask in responses, hash-based dedupe | in progress |
| phase 2 | pending |

## Where we are

- `PIIEnvelope` (per-field encrypted values with `keyVersion`), `@halo/shared`'s
  `pii-envelope.ts` (AES envelope encrypt / decrypt / re-encrypt with versioned
  keys) and `PIIService` (encrypt, decrypt with actor audit, `rotateAll`) all
  exist and are tested. **Nothing calls them.**
- The contact PII lives in plaintext on `leads`: `canonicalPhone`,
  `canonicalEmail`, `canonicalOwner`. It also appears in `messages.metadata`
  (`phone`, `to`, `email`), `dnc_lists.phone`, `consents`, and in timeline /
  audit payloads.
- `leads_canonicalOwner_trgm_idx` (trigram GIN) backs fuzzy owner search;
  `leads_canonicalAddress_trgm_idx` backs address search.
- Exact-match reads that must keep working:
  - Twilio inbound attribution: `lead.findMany({ canonicalPhone: { in: … } })`
  - dedupe / merge and CSV import matching by phone and email
  - DNC checks by phone; DocuSign signer email; agent draft context

## Threat model (what encryption buys and what it doesn't)

Column encryption protects against: a database dump or backup leaking, a
read-only DB credential leaking, an analyst or BI tool with table access, and
log/metric sinks that copy rows. It does **not** protect against a compromised
api process (it holds the key) or an attacker with an authenticated session —
those are authz and audit problems, and #84/#85 were about those.

Volume/RDS encryption at rest is assumed as a baseline and is not a substitute:
it does nothing once the database is running.

## Options

### A. Application-level field encryption + blind indexes — recommended

Encrypt the sensitive columns in the api with the existing envelope primitives
and add a keyed hash column for each value that needs exact-match lookup.

- `leads.canonicalPhoneEnc`, `leads.canonicalEmailEnc` — envelope ciphertext
  (`pii-envelope.ts`, versioned key `PII_ENCRYPTION_KEY_V<n>`)
- `leads.canonicalPhoneHash`, `leads.canonicalEmailHash` — `HMAC-SHA256(indexKey, normalized value)`, indexed `(accountId, hash)`. Lookups by phone or email query the hash; the plaintext never touches the query.
- `canonicalOwner` **stays plaintext** (see decision 1) so trigram search keeps working.

Reads decrypt on demand in a `LeadPII` accessor; list endpoints return a mask
(`•••• 1234`) unless the caller has `pii:read`, and every full reveal goes
through `PIIService.decrypt` so it's audited with the actor.

Cost: one extra small computation per write and per revealed read; two index
columns; a backfill. Rotation of the encryption key uses `keyVersion` +
`reEncryptPII` in batches with no downtime. Rotation of the *index* key
requires re-hashing every row (rare; plan it as a maintenance job).

### B. pgcrypto in-database encryption — not recommended

`pgp_sym_encrypt` with the key passed per session. The key transits to the
database and appears in query logs; there is no clean versioned rotation;
every consumer of the column must remember to decrypt. It also does not help
the trigram problem.

### C. Encrypt everything including owner name, with searchable n-gram tokens

Fully encrypting `canonicalOwner` kills the trigram index. Search would need
an HMAC'd n-gram token table (each name split into 3-grams, each hashed,
queried by hashed tokens). It works, it is a real project (token tables,
ranking, backfill, ~5–10× write amplification on names) and it protects a
value that is public record (county assessor rolls list owner names against
addresses). Only worth it if a policy or contract requires it.

## Plan for option A

1. **Schema** (additive, no downtime): four nullable columns above; unique
   partial index on `(accountId, canonicalPhoneHash)` is *not* added — leads
   legitimately share a phone (spouses, LLCs); use a plain index.
2. **Dual-write**: write path (`LeadsService.create/update/importCSV`, worker
   enrichment, `mergeLeads`) sets ciphertext + hash *and* the plaintext column.
   Read path prefers ciphertext when present, falls back to plaintext.
   Ship, run for a release.
3. **Backfill**: idempotent batch job (`prisma/scripts/backfill-lead-pii.ts`)
   encrypts and hashes rows whose `*Enc` is null. Safe to re-run.
4. **Cut lookups over**: Twilio inbound, dedupe, CSV matching, DNC and DocuSign
   read via the accessor / hash columns. Tests for each path.
5. **Cutover**: stop writing plaintext; migration nulls then drops
   `canonicalPhone` / `canonicalEmail`. Keep the `*Enc` names or rename back —
   renaming back is cleaner but touches every reader again; leave as is.
6. **Phase 2 (separate PRs)**: `messages.metadata.phone/to/email` (write the
   hash beside them so inbound matching by message works), `dnc_lists.phone`
   (hash column; DNC lookups already exact-match), `consents`, and scrubbing
   phone/email from timeline and audit payloads (store the lead id, not the
   number).

## Key management

- `PII_ENCRYPTION_KEY_V1` (32 bytes, base64) and `PII_INDEX_KEY` (32 bytes)
  in the api's environment / secret store only. **The worker never needs
  them** — it writes contact data through the api (skip-trace already goes
  through `/api/internal`), so the api does the encryption.
- `PII_ENCRYPTION_KEY_CURRENT_VERSION` selects the write key; older versions
  stay readable until `rotateAll` finishes.
- Losing `PII_ENCRYPTION_KEY_*` loses the data. Back the keys up separately
  from the database.
- Keys are refused in production if shorter than 32 bytes (same posture as
  `INTERNAL_API_TOKEN`).

## Decisions needed

1. **Is the owner name in scope?** Recommendation: no — public record, and
   encrypting it removes owner search (option C) for little protective gain.
   If a contract or state rule says otherwise, choose C and budget it as its
   own project.
2. **Inline columns vs the `PIIEnvelope` table** for lead phone/email.
   Recommendation: inline (`*Enc` on `leads`) — no join on every read, simpler
   backfill. Keep `PIIEnvelope` for one-off fields on other entities, or drop
   it if nothing adopts it within a release.
3. **Phase 2 scope and order**: messages metadata → DNC → consents → payload
   scrubbing. Confirm, or reorder by risk.

With 1–3 answered, step 1–2 (schema + dual-write + accessor + tests) is a
contained PR; the backfill and cutover follow once dual-write has run.
