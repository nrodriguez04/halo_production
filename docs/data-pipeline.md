# Property data, buyer discovery and market intelligence

This covers how Hālo gets data on any property in the country, turns recorded sales into likely cash buyers, and ranks where to work.

Code:
- shared logic: `packages/shared/src/data/`;
- API: `apps/api/src/data/`, `apps/api/src/integrations/{attom,regrid}`;
- web: `apps/web/app/(app)/buyers/discovery`, `apps/web/app/(app)/markets/intelligence`.

## 1. Principles

- **One shape for every provider.** ATTOM, Regrid and county exports are turned into `NormalizedProperty` and `NormalizedSale` (`records.ts`) before anything stores them. Nothing downstream depends on one vendor.
- **Every record says how much to trust it:**
  - `recorded`: a public record, such as a deed or an assessor roll;
  - `reported`: a provider's compilation;
  - `estimated`: a model's output, such as an AVM value.
- **Records show; Hālo infers; buyers state.** These three are kept apart:
  - a recorded purchase is evidence;
  - a buy box worked out from purchases is an inference;
  - an offer or proof of funds is something only the buyer provides.

  Discovery never presents history as current interest.
- **Research is allowed in every jurisdiction.** Data and rankings cover every state Hālo has data for, whatever its market status (docs/markets.md).
- **Paid calls go through cost control.** Every provider call passes budget, rate limits and idempotency, and every raw response is kept as a `SourceRecord`.

## 2. Property facts

- **Enrichment writes the lead's Property.** It runs geocode, then ATTOM, then skip trace. Before this change it kept ATTOM's profile only as a source record, so deals made from leads had no property and the Deal Underwriter stopped on "no property".
- **The ATTOM step now writes the property.** `/internal/enrichment/property-lookup` normalizes the profile and `PropertyFactsService.applyToLead` writes it:
  - county and county FIPS, parcel number and coordinates;
  - type, beds, baths, square feet and year built;
  - assessed and market value (the market value goes in `estimatedValue`);
  - last sale, owner kind and absentee status;
  - the source, its reference and the data quality.
- **A provider that does not report a fact never erases it.** An open deal on the lead is linked to the property.
- **Regrid parcels** (`POST /data/regrid/parcel`) can fill the same row from county assessor data.

## 3. Recorded sales

`recorded_sales` holds sales from any source:
- buyer, seller and their kinds and match keys;
- price and date;
- whether a purchase mortgage was recorded;
- arm's length and deed type.

Re-importing a record is a no-op (`accountId, source, sourceRef` is unique).

Sources:

| Source | How | Gives buyer names | Status |
|---|---|---|---|
| County export (CSV) | Upload to Documents, then **Buyer discovery → Import county sales**. Columns are guessed, a person confirms the mapping, and blank mortgage means cash. | yes | works; tested on synthetic files |
| ATTOM sales history | `POST /data/attom/sales-history {address}` | yes, where the county records them | built to ATTOM's documented API; not yet run against a live key |
| ATTOM area snapshot | `POST /data/attom/area-sales {postalCode, dates, maxPages}` | no (prices and dates only) | **live-verified 2026-10-23**: one page for Dallas 75217 imported 96 sales with county FIPS, no county name |
| Regrid parcel | `POST /data/regrid/parcel` | owner, not buyer | built to Regrid's v2 API; **not run against a live token** |

**Only import data you are authorized to use.** County terms differ, and the import screen says so.

## 4. Buyer discovery

`discoverInvestors` (`investors.ts`) groups recorded purchases by buyer.

**Matching buyers:**
- names are normalized: punctuation removed, suffixes standardized (L.L.C. → LLC, "Limited Liability Company" → LLC, Incorporated → INC), a leading "The" dropped;
- a person must also match on mailing zip, because names repeat.

**Who is skipped:**
- lenders and government agencies (foreclosures and REO are not investors);
- non-arm's-length sales;
- one-time buyers.

**Each candidate carries:**
- purchases and cash purchases;
- resales within 18 months, matched by parcel number (by address only when either record lacks one), and the median hold;
- recency;
- an inferred buy box: states, counties, cities, zips, the 10th–90th percentile price band, and property types;
- a score with reasons.

**The flow:**
- `POST /buyer-candidates/refresh` finds candidates. Someone who is already a buyer is linked rather than offered again.
- `POST /buyer-candidates/:id/promote` creates a buyer:
  - `source: public_record`;
  - the buy box marked `inferred: true`;
  - one `public_record` transaction per purchase, with its reference, so the ranking counts them as history.
- **A promoted buyer has no contact and no consent.** They are not contactable until a person records both. Hālo never treats history as proof of funds.

## 5. Market intelligence

`aggregateSales` and `scoreGeo` (`market-intelligence.ts`) rank metros, counties or zips out of 100. Each component names its basis: `recorded`, `halo`, `policy`, `estimate` or `unknown`.

| Component | Max | Basis |
|---|---|---|
| Legal availability | 15 | the market's effective status and class |
| Resale spread (what investors made) | 15 | recorded resales; unknown below 3 |
| Investor and cash-buyer activity | 15 | distinct investor buyers in 12 months |
| Distressed opportunities | 10 | Hālo's leads with foreclosure, tax, lien or vacancy signals |
| Low acquisition competition | 8 | the investor share of sales |
| Property values and comps | 7 | median price band; sales for comps |
| Assignment-fee potential | 10 | Hālo's realized fees; otherwise 6% of the median price, **labelled an estimate** |
| Transaction volume | 10 | recorded sales in 12 months |
| Contract-to-close time | 5 | Hālo's closings; unknown otherwise |
| Data quality | 5 | volume and recency |

- **Opportunity** is the score without the legal component.
- **`recommendMarkets`** orders states by opportunity × feasibility. Feasibility comes from the market's status and class: A is easiest, E is hardest. Active, restricted and blocked states are left out.
- **A recommendation never activates anything.** On the page, a class from research is marked "proposed".

**Metros** are the Census Bureau's core based statistical areas (CBSAs), from its July 2023 delineation (OMB Bulletin 23-01).
- `metros.ts` reads the generated crosswalk in `cbsa.ts`: 935 CBSAs and the 1,915 counties inside them. Regenerate it with `npx tsx scripts/generate-cbsa.ts` when OMB issues a new delineation.
- A sale reaches a metro only through its county FIPS. Sales in a county outside every metro appear at county and zip level only.
- A metro's legal standing is that of its weakest state. Memphis (TN-MS-AR) with Tennessee approved and Mississippi research-only scores Mississippi's standing.
- With a `state` filter, only that state's sales count, so a metro across state lines shows its part in that state.
- County labels fall back to the delineation's county name when a source gives only the FIPS, as ATTOM's area snapshot does.

Routes:
- `GET /market-intelligence?level=metro|county|zip&state=`;
- `GET /market-intelligence/recommendations`.

**Analyst brief.** The Market Intelligence agent explains this ranking: why the leaders rank where they do, their risks and what to verify, plus the data gaps that limit it. Ask for a brief on the Market Intelligence page, nationwide or for one state.
- **It cannot change the ranking.** Priorities naming anything but a ranked candidate are dropped, and the rest are kept in Halo's order.
- **It changes nothing else.** Its only action records the brief on the run.
- **No data, no model call.** With no recorded sales it holds and says what data is missing.
- **No clearance claims.** A brief that calls a market legal, approved or cleared is refused.
- See docs/agent-design.md s3.6.

**Not yet:**
- aggregation in SQL for very large sale tables. Today sales are aggregated in memory, which is fine to roughly a few hundred thousand rows per tenant.

### 5.1 Conversion funnel

`GET /analytics/funnel?from=&to=` (default: the last 90 days) and the **Conversion Funnel** page show how the leads created in a period moved, and what each source and state cost and earned. `funnel.ts` (shared) does the arithmetic; `FunnelService` gathers one record per lead.

| Stage | A lead counts when |
|---|---|
| Leads | it was created in the period |
| Reachable | it has a phone or email that is not on the do-not-contact list |
| Contacted | an outbound message to it was sent or delivered |
| Conversations | the owner wrote back |
| Offers | a deal on it has an offer amount |
| Contracts | a purchase agreement on it was executed |
| Assignments | an assignment agreement on it was executed |
| Closed | its closing file is closed; the realized fee counts |

- **Stages nest.** A lead counts at every stage up to the furthest it reached, so each rate stays between 0 and 1. A close is measured against contracts, because a double close has no assignment.
- **Costs** are the completed provider charges recorded against each lead. Spend tied to no lead (area pulls, agent runs, tests) is reported separately and not spread across sources.
- **Sources** come from a lead's `source:` tag. Listing imports already set one; CSV imports now tag `source:csv_import`, and leads entered by hand or through the API `source:manual`. Leads created before 2026-10-23 without a tag are `unattributed`.
- **Not yet:** campaign spend that is not a provider charge (mail, ads, list purchases) has no record to count, and leads are grouped in memory, which suits up to a few hundred thousand per period.

## 6. Configuration

| Setting | Where |
|---|---|
| `ATTOM_API_KEY`, `REALIE_API_KEY`, `RENTCAST_API_KEY` | Integrations page or env (existing). A key saved on the Integrations page wins over env. |
| `REGRID_API_TOKEN` | Integrations page or env |
| External data switch | Control Plane: provider calls are refused while it is off |
| Costs | `cost-control/seed-providers.ts`: ATTOM `sales_history` and `sales_snapshot` at $0.10 per call; Regrid `parcel_lookup` at a $0.02 placeholder. Set these from the contracts. |

Permission:
- `data:write` covers imports and paid pulls;
- reading, discovery and promotion need only a signed-in user, like the rest of the buyers area.

## 7. Tests

- **Shared** (`data/data.test.ts`):
  - party normalization and kinds;
  - the ATTOM and Regrid normalizers;
  - the county column mapping, including inferring cash from the mortgage column;
  - the CSV reader (quotes, newlines, BOM);
  - investor discovery (cash, resales, buy box, lenders skipped);
  - scoring and recommendations.
- **Real Postgres** (`test/integration/data-pipeline.int-spec.ts`):
  - a county export imported twice (duplicates skipped);
  - discovery and promotion into a buyer the ranking scores on history but cannot contact;
  - ranked counties and zips;
  - state recommendations;
  - provider facts on a lead's property, which a later lookup never erases.
