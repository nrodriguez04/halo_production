# Lead sources: MLS feed, RentCast, Realie

**Leads → Import listings** pulls property records from an outside source and
turns them into leads. Three sources share one path; they differ in what they
can see and what they cost.

| Source | What it is | Needs | Status vocabulary | Cost |
| --- | --- | --- | --- | --- |
| **MLS feed** | Your licensed RESO Web API feed (Bridge, MLS Grid, Trestle, Spark, SimplyRETS). See `mls.md`. | An MLS invite via a member broker or agent | Active, Pending, Expired, Withdrawn, Canceled, Closed | $0 per call unless the vendor charges |
| **RentCast** | Aggregated sale listings, nationwide, no MLS approval | `RENTCAST_API_KEY` | Active, Inactive (anything that left the market, sold or not) | One billable request per page |
| **Realie** | County records: owner of record and mailing address, assessed and market values, sale history, mortgages, liens, foreclosures, tax status | `REALIE_API_KEY` | None. The selector is an **owner filter**: Absentee, Owner-occupied, Any | One token per page of up to 100 parcels; empty results are free |

Only the MLS feed and RentCast know whether a property is listed. Realie has
no listing data at all, so "expired listings" cannot come from it. What Realie
gives instead is the other classic wholesale list: **absentee owners** in an
area, optionally narrowed to **recent transfers**, each with the owner's name
and the county's view of value, debt and tax standing.

## The shared import

`POST /api/leads/import/listings` (tenant-scoped, same auth as `/api/leads`):

```json
{
  "source": "realie",            // mls | rentcast | realie (default mls)
  "state": "TX",                 // required for Realie, two letters
  "city": "Houston",             // city or postalCode is required
  "postalCode": "77008",
  "status": ["Absentee"],        // source vocabulary above, up to 5; default is the first
  "minPrice": 100000,            // listing feeds only
  "maxPrice": 300000,
  "minDaysOnMarket": 90,         // listing feeds only
  "transferredWithinDays": 180,  // Realie only
  "propertyType": "Single Family",
  "limit": 50,                   // 1..200
  "offset": 0
}
```

Returns `{ source, feed, searched, total, created, duplicates, errors }`.
`POST /api/leads/import/mls` is the MLS-only alias.

1. **Search.** The source adapter calls the vendor through
   `IntegrationCostControlService.checkAndCall` (provider `mls`, `rentcast` or
   `realie`), so every pull is rate-limited, ledgered and cached: 15 minutes
   for MLS, 12 hours for RentCast and Realie searches, 30 days for a Realie
   address lookup. Repeating a pull inside the window costs nothing.
2. **Import.** Records with a street address and ZIP go through the same
   `importCSV` path as a CSV upload, so the (ZIP, normalized address) dedupe
   applies and re-running a search is safe. Realie records also carry the
   owner of record into the lead.
3. **Provenance.** Each lead gets a `source_records` row (`provider` = the
   source, `requestHash` = the vendor's record id, trust 0.9 MLS / 0.85
   Realie / 0.8 RentCast). The raw record is sealed because listing feeds
   include the listing agent's direct contacts; the non-contact facts stay in
   the clear.
4. **Tags.** `source:<source>` always. Listing feeds add `listing:<status>`
   and `stale_listing` at 90+ days on market. Realie adds owner signals
   instead: `owner:absentee` or `owner:occupied`, `tax:delinquent`,
   `foreclosure`, `lien`, `distressed_sale`, `recent_transfer`.

The listing agent's contacts are never copied onto the lead: the lead's phone
and email are for the owner, and the seller-outreach path must not message an
agent. They remain in the sealed source record.

## Realie details

- Endpoints used: `GET /public/property/search/` (state required; city, zip,
  county, `residential`, `transferedSince` days, `limit` ≤ 100, cursor
  pagination) and `GET /public/property/address/` (one parcel by street
  address; Realie wants `county` whenever `city` is given). Header
  `Authorization: <key>`.
- An import reads up to five pages (five tokens) and stops when the requested
  count is reached. With an owner filter it reads full pages, because one
  token covers a page of 100 whether 1 or 100 parcels match.
- Realie serves two response shapes, chosen per account (nested v3 or the flat
  v2-compatible one). The normalizer reads both; owner-occupancy comes from
  Realie's flag when present, otherwise from whether the mailing address is
  the property.
- Billing: Free plan 25 tokens a month, then paid tiers; only `200` responses
  spend a token, a `404` (no results) is free, `401` is a bad key, `403` is a
  billing or spending-limit block. Add a payment method in Realie's Billing
  before relying on it.
- Property type for Realie is the county use code (e.g. `1110`), not a
  listing feed's type name.

## RentCast details

- `GET /listings/sale` with `city`/`state`/`zipCode`, `status` Active or
  Inactive, `propertyType`, `price=min:max`, `daysOld=min:*` for active
  listings, `limit`, `offset`, `includeTotalCount=true` (total in
  `X-Total-Count`). Ranges use `min:max` with `*` for an open end.
- RentCast answers `404` when nothing matches; that is an empty import.
- Inactive cannot distinguish expired from sold. Use the MLS feed for true
  expired lists.

## Setting it up

Keys go on **Admin → Integrations → Real-estate & property data** (RentCast,
Realie, MLS listings) or in the API environment (`RENTCAST_API_KEY`,
`REALIE_API_KEY`, `MLS_*`). Values saved on the page win over env and need no
restart. Each card's **Test Connection** proves the key; Realie's test uses an
address that cannot exist, so it costs no token.

## Not in this version

- Scheduled pulls. Imports are on demand; a nightly "new expireds / new
  absentee transfers" job belongs with the agent triggers in
  `docs/agent-design.md`.
- Realie address lookup in the enrichment pipeline. `RealieService.lookupAddress`
  exists and is cost-governed; wiring it next to ATTOM in
  `/internal/enrichment/property-lookup` is the natural follow-up so every
  lead gets an owner of record.
- Skip tracing stays with the `batch` provider; Realie has owner names and
  mailing addresses but no phones or emails.
