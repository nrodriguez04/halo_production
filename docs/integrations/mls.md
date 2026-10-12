# MLS listings

Halo can pull listings from an MLS feed into the lead pipeline. Stale, expired
and withdrawn listings are a classic wholesale signal: a seller who has been
on the market for 90+ days, or whose agent gave up, is often open to a cash
offer. The import turns each listing into a lead (address only; the seller's
contact details are not in any MLS feed and come from enrichment / skip
trace later), keeps the listing itself as provenance on the lead, and tags it
so the triage views can filter on it.

## Where the data comes from

MLS data is licensed per MLS, not sold centrally. Consumer portals such as
mls.com, Zillow or Realtor.com are advertising front-ends: they publish no
API, and their terms prohibit scraping. Halo does not scrape them.

The data path is a **RESO Web API** vendor. Every US MLS of any size offers
its licensed feed through one or more of these; all of them speak the same
OData dialect with the RESO Data Dictionary field names, which is what the
`Property` search here is written against:

| Vendor | Notes |
| --- | --- |
| **Bridge Data Output** (Zillow Group) | The default dialect (`bridge`). Register at bridgedataoutput.com, request the dataset for your MLS, and the MLS approves (or declines) your account. One dataset per MLS, e.g. `actris`, `har`, `crmls`. Auth is a server token sent as `access_token`. |
| **MLS Grid** | Dialect `reso`. Bearer token, base URL `https://api.mlsgrid.com/v2`. |
| **CoreLogic Trestle** | Dialect `reso`. OAuth client credentials; put the resulting bearer token in `MLS_API_TOKEN` and the WebAPI base URL in `MLS_BASE_URL`. |
| **Spark (FBS)** | Dialect `reso`. Bearer token, base URL `https://replication.sparkapi.com/Reso/OData`. |
| **SimplyRETS** | Dialect `simplyrets`. A paid aggregator with its own JSON API and a public demo feed (`simplyrets` / `simplyrets`) that returns fictional Houston listings. Used for the local smoke test; no MLS approval needed. |

Expect the approval step to take days to weeks and to require an active
broker or agent licence, an IDX/VOW or data-licence agreement with the MLS,
and sometimes a per-feed fee. Until that lands, the SimplyRETS demo exercises
the whole path end to end.

## Configuration

Set these in the API environment or save them on **Admin → Integrations →
Real-estate & property data → MLS listings**. Saved values win over env and
take effect on the next call; no restart.

| Setting | Used by | Meaning |
| --- | --- | --- |
| `MLS_PROVIDER` | all | `bridge` (default), `reso` or `simplyrets` |
| `MLS_BASE_URL` | reso; optional for others | Full RESO Web API root. Defaults to Bridge's `https://api.bridgedataoutput.com/api/v2/OData` and SimplyRETS' `https://api.simplyrets.com` |
| `MLS_DATASET` | bridge | The MLS dataset name in the path |
| `MLS_API_TOKEN` | bridge, reso | Server / bearer token |
| `MLS_USERNAME`, `MLS_PASSWORD` | simplyrets | Basic-auth credentials |

**Test connection** on the Integrations card runs a one-record search with the
saved settings and reports the first missing setting by name.

### Local smoke test

```bash
# apps/api/.env.local
MLS_PROVIDER=simplyrets
MLS_USERNAME=simplyrets
MLS_PASSWORD=simplyrets
```

Then **Leads → Import listings**, source *MLS feed*, city `Houston`, or:

```bash
curl -s -X POST http://localhost:3001/api/leads/import/mls \
  -H 'content-type: application/json' \
  -d '{"city":"Houston","status":["Active"],"limit":5}'
```

## How the import works

`POST /api/leads/import/mls` is the MLS-only alias of
`POST /api/leads/import/listings` with `"source": "mls"` (see
`listing-sources.md` for RentCast and Realie). Tenant-scoped, same
auth as the rest of `/api/leads`; it takes:

```json
{
  "city": "Houston",            // city or postalCode is required
  "state": "TX",
  "postalCode": "77008",
  "status": ["Active"],         // RESO StandardStatus values, up to 5; default Active
  "minPrice": 100000,
  "maxPrice": 300000,
  "minDaysOnMarket": 90,
  "propertyType": "Residential",
  "limit": 50,                  // 1..200
  "offset": 0
}
```

and returns `{ searched, total, created, duplicates, errors, dialect }`.

1. **Search.** `MlsService.searchListings` resolves the settings, builds the
   OData `$filter` (or the SimplyRETS query) and calls the feed through
   `IntegrationCostControlService.checkAndCall` as provider `mls`, action
   `search_listings`. The seeded pricing rule is **$0 per call**; if your feed
   vendor charges per request, change the rule and the ledger follows. Calls
   are rate-limited (60/min) and cached for 15 minutes keyed on the criteria,
   so a page refresh does not re-query the feed. The cache entry is sealed at
   rest because listings carry the listing agent's direct phone and email.
2. **Import.** Listings with a street address and ZIP become rows for the same
   `importCSV` path the CSV upload uses, so the (ZIP, normalized address)
   dedupe applies: an address already in the account is reported as a
   duplicate, never recreated. Re-running a search is safe.
3. **Provenance.** Each lead gets a `source_records` row with
   `provider = 'mls'`, `requestHash = <ListingKey>`, trust weight 0.9. The
   non-contact facts (status, list price, days on market, beds/baths, size,
   year built, list date) sit in the clear for queries; the full raw record is
   sealed with the PII keys because of the agent contacts in it.
4. **Tags.** `source:mls`, `listing:<status>` (e.g. `listing:active`,
   `listing:expired`) and `stale_listing` when days on market is 90 or more.

The listing agent's contacts are deliberately **not** copied onto the lead:
the lead's phone and email are for the owner, and messaging an agent through
the seller-outreach path would be wrong on both compliance and etiquette
grounds. They remain available in the sealed source record for a future
"contact the listing agent" flow.

## Dialect details

- **bridge / reso** query `{base}/Property` (Bridge: `{base}/{dataset}/Property`)
  with `$filter`, `$top`, `$skip`, `$orderby=ModificationTimestamp desc`,
  `$count=true`, and read `value[]` plus `@odata.count`. Bridge's error
  envelope (`{ "error": { "code", "message" } }`) is surfaced as an
  `UPSTREAM_ERROR`; HTTP 401/403 as `REJECTED_CREDENTIALS`. Query strings are
  RFC 3986 encoded (spaces as `%20`), which every RESO server decodes; some
  reject `+`.
- **simplyrets** queries `/properties` with `cities`, `postalCodes`, `status`
  (repeatable), `type`, `minprice`, `maxprice`, `limit`, `offset`, and reads
  the total from `X-Total-Count`. The feed has no days-on-market filter, so
  `minDaysOnMarket` is applied client-side and a page can come back shorter
  than `limit`.
- Field availability varies by MLS. `DaysOnMarket` in particular is restricted
  in some feeds; when it is absent the listing simply is not tagged stale.

## Not in this version

- **Incremental sync.** The import is on-demand and page-based. A scheduled
  replication by `ModificationTimestamp` (and the agent trigger "listing just
  expired" in `docs/agent-design.md`) is the natural next step once a licensed
  feed is connected.
- **Photos, open houses, history.** Only the `Property` resource is read.
- **Status vocabulary.** The UI offers the RESO StandardStatus values; a feed
  may expose only a subset (SimplyRETS' demo, for instance, has no `Expired`).
