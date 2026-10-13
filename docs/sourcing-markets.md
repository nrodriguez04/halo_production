# Sourcing markets

A market is the standing "find" instruction for one area: where, which
sources, which filters, how often. The scheduler pulls every enabled market
on its cadence, through exactly the same path as **Leads → Import listings**,
so dedupe, provenance and tags are identical whether a human or the schedule
started the pull. This is how Hālo covers the country: add the markets you
want (one click adds the 50 largest US cities), and new leads arrive every
morning without anyone clicking.

## How it runs

- `SourcingSchedulerService` ticks every `SOURCING_TICK_SEC` seconds (default
  300) and looks for enabled markets whose `nextRunAt` has passed. It claims
  each one with a conditional update that moves `nextRunAt` forward, so two
  API replicas never pull the same market twice, then runs it.
- Daily markets run at `SOURCING_RUN_HOUR_UTC` (default 06:00 UTC, overnight
  in the US). Weekly markets run Mondays at that hour. Manual markets only run
  from the **Run now** button.
- Each run imports every source in turn. A source that fails (no key, rejected
  key, vendor down, budget blocked) is recorded in the market's **last result**
  and does not stop the others. The run is booked as an `AutomationRun`
  (source `sourcing`, workflow `market_pull`) so it appears on the Automation
  page with its cost; when every source failed, the run is marked failed.
- The control-plane kill switch stops pulls: a disabled tenant's markets are
  rescheduled without calling any vendor.
- `SOURCING_SCHEDULER=off` disables the loop (tests, or a replica that should
  only serve requests).

## Auto-enrichment

New leads (from markets, listing imports, CSV) arrive in `new`. Every ten
minutes the api moves the best of them to `enriching`, which queues the
enrichment job (geocoding and the property lookup), up to the tenant's
daily cap. Best means distress first (tax delinquency, liens, foreclosure,
probate, vacancy), then stale or expired listings and absentee owners, then
everything else, newest first within each tier; owner-occupied leads with no
other signal go last.

- The switch and the cap (default on, 20 leads per UTC day) are on the
  control plane and editable on **Leads > Markets > Auto-enrichment**, which
  also shows today's usage and has an **Enrich now** button.
- Nothing runs when the control plane or its paid-data switch is off, and
  every call still goes through the Cost Governance budgets.
- Skip trace is not part of this step: it runs right after the Lead Analyst
  scores a lead 60 or higher (cost control's skip-trace threshold), so leads
  that are disqualified never pay for it. The skip-trace key is on
  **Admin > Integrations > BatchSkipTracing**.
- `AUTO_ENRICH=off` disables the loop (tests, or a replica that should only
  serve requests). Usage is counted from the lead timeline
  (`lead.status.enriching` events marked `autoEnrich`).

## Cost

Every pull is a normal cost-governed call: RentCast bills one request per
page, Realie one token per page of up to 100 parcels, MLS feeds whatever the
licence says. A nightly schedule over 50 metros with RentCast and Realie is
about 100 vendor calls a day; the Markets page shows that estimate before you
add the metros. Results repeat heavily from day to day, and repeats are
duplicates, not new leads; the 12-hour response cache means a manual re-run
inside that window costs nothing.

## API

All routes are tenant-scoped under `/api/sourcing`:

| Route | Purpose |
| --- | --- |
| `GET /markets` | the tenant's markets with `lastResult` and `nextRunAt` |
| `POST /markets` | `{ label?, state, city? \| postalCode, sources[], criteria?, cadence?, enabled? }` |
| `POST /markets/metros` | `{ count (1..50), sources[], criteria?, cadence }`: add the largest cities not already present |
| `PATCH /markets/:id` | any of the fields above; cadence or enabled changes reschedule |
| `DELETE /markets/:id` | remove |
| `POST /markets/:id/run` | pull now |
| `GET /metros` | the built-in city list |
| `GET /runs?limit=` | recent sourcing automation runs |

`criteria` uses the import route's vocabulary: `status[]` (listing status for
MLS/RentCast, owner filter for Realie), `minPrice`, `maxPrice`,
`minDaysOnMarket`, `transferredWithinDays` (Realie), `propertyType`, `limit`
(1..200, default 50 per source per run).

## Not yet

- Per-market budgets. Spend is governed by the provider and tenant buckets in
  cost governance, not per market.
- ZIP lists. A market is one city or one ZIP; add several markets for several
  ZIPs.
