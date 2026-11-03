# Asset classes: residential, land and commercial

Hālo wholesales three kinds of real estate. Each kind has its own classification, sourcing filters, property facts, underwriting, buyers and documents. Residential works as it always has. Land and commercial deals get their own workflows instead of being treated as houses.

Code: `packages/shared/src/assets/` (pure logic), `apps/api/src/assets/` (classification, facts, public-record checks), `apps/api/src/disposition/asset-underwriting.service.ts` (underwriting by class), and the asset-class path of `apps/api/src/leads/listing-import.service.ts` (sourcing). Migration: `20261103120000_asset_classes`.

## 1. Principles

- **Unclassified is not residential.** A record no rule or person has classified stays unclassified, with a suggestion and what to check. It is never filed as a house by default.
- **A missing fact is never a favorable one.** A utility line on the next road is not utility service. A parcel touching a road does not have legal access because of it. Underwriting reads `unknown` as a risk.
- **Numbers are deterministic.** Valuations, offer ranges and fees are arithmetic on records. The agents explain them; they never produce them for land or commercial deals.
- **Inference stays inference.** A company that bought three lots looks like a land investor. It is not a confirmed buyer, and every screen says so.
- **Provider claims are checked against the code.** A provider is said to support a filter only when its adapter reads that field (s11).

## 2. Classification

`classifyProperty` (`classify.ts`) reads the provider's labels as evidence alongside the physical facts: whether a building stands on the parcel, units, building area, acreage, zoning, and the provider's residential flag.

| Class | Subtypes |
|---|---|
| Residential | single-family; condo or townhome; duplex to fourplex; manufactured |
| Land | vacant residential lot; infill lot*; rural acreage; agricultural; recreational; undeveloped commercial land; development parcel*; subdividable* |
| Commercial | multifamily (5+ units); retail; office; industrial or warehouse; mixed use; self-storage; flex; hospitality; other |

\* Only a person sets these. Each is a judgement about what a parcel could become. The classifier reports development indicators instead (acreage, residential zoning on large parcels, commercial zoning on unbuilt land).

Rules, in order:
- **5 or more units** is commercial multifamily, whatever the label says. 2 to 4 units is a residential duplex-to-fourplex.
- **Land vs commercial** is decided by what stands on the parcel. An unbuilt parcel labelled or zoned commercial is land (subtype undeveloped commercial land). A building used for commerce is commercial.
- **Conflicts stay unclassified:**
  - labels that disagree;
  - a land label on a parcel with a building on record;
  - a bare "COMMERCIAL" with nothing known about the building;
  - a numeric county use code;
  - a non-residential flag with nothing else.
- **Confidence:** high or medium is stored as classified. Low is stored as unclassified with a suggestion.
- **Stored on the property:**
  - `assetClass` and `assetSubtype`;
  - `assetClassBasis`: `rules`, `mapping` or `operator`;
  - `assetClassConfidence` and `assetClassReasons`;
  - the provider's labels, untouched (`propertyType`, `landUse`).
- **A person's call always stands** (`PUT /properties/:id/asset-class`, audited). Clearing it hands the property back to the rules.
- **Use-code mappings:** county codes such as Realie's `1110` differ by county. A person confirms once what a code means in a state, optionally for one county and one provider (`POST /asset-code-mappings`). The mapping then classifies every record with that code that no person has classified by hand.
- **Existing records:** the migration classified a property only where its type label is plainly residential (SFR, single family, condo, townhome, duplex to fourplex, manufactured). Everything else stays unclassified.

## 3. Sourcing and parcels

- **A property may have no street address.** `address`, `city` and `zip` are optional. A rural parcel is identified by state, county and APN.
- **Parcel identity:** `parcelKey(state, county, apn)` = `STATE|county|APN`, normalized (`parcel.ts`; the migration computes the same key in SQL). It deduplicates across providers, across sourcing markets that overlap, and within one pull.
- **Naming:** `propertyLabel()` names a property everywhere. It uses the street address when there is one, else "Parcel R12345, Bastrop County, TX".
- **Sourcing markets** (`docs/sourcing-markets.md`):
  - A market lists its `assetClasses`, with each class's filters in `criteria.land` and `criteria.commercial` (`LandCriteriaSchema`, `CommercialCriteriaSchema` in `sourcing.ts`).
  - Several markets can cover the same area with different strategies.
  - A market saved before asset classes is residential.
- **The asset-class import** (`ListingImportService.importByAssetClass`), for each record a search returns:
  1. Classify it, using a confirmed code mapping when there is one.
  2. Keep it only if it fits one of the market's classes and passes that class's filters. A filter on a fact the record lacks rejects it: unknown acreage does not meet "at least 5 acres". An unclassified record whose suggestion fits is kept and tagged `asset:unclassified` for a person to confirm.
  3. Drop it as a duplicate if its parcel key is already on file.
  4. Import an addressed record through the CSV path (address dedupe, as before). Create a parcel with no address directly as a lead with no `canonicalAddress`.
  5. Write the property with its facts and classification, and tag the lead `asset:<class>` and `asset:<subtype>`.
- **The run result** adds `filtered` (with reasons), `unclassified` and `byClass`.
- **Small first batch:** land and commercial markets start **manual**. `POST /sourcing/markets/:id/run {limit}` runs a capped batch (at most 25 records per source) before anyone turns the schedule on.
- **Estimate first:** `POST /sourcing/estimate` gives, before anything is pulled:
  - the most each source can bill per run and per month, at the rate card;
  - which filters each provider applies and which Halo applies after the pull;
  - the state's research-only status per class.
- **Cost governance is unchanged.** Every provider call goes through `checkAndCall`: budgets, rate limits, cache, ledger.

## 4. Property intelligence

`PROPERTY_FACTS` (`facts.ts`) lists what land and commercial deals turn on. Each fact records its value, `status`, source, source URL, document and note (table `property_facts`; the history is in `audit_logs`).

| Status | Meaning |
|---|---|
| verified | An authoritative record (county, GIS, a federal map) or a document a person checked |
| reported | A provider's compilation, or what the seller said or sent, not yet checked |
| estimated | Derived or modelled |
| unknown | Nothing on file |
| needs_diligence | Only a professional can settle it (surveyor, title company, engineer, environmental consultant) |

- **Land facts:**
  - parcel boundary, gross and usable acreage;
  - legal and physical access, road frontage, easements;
  - zoning, permitted uses, setbacks;
  - water, sewer or septic, electric;
  - flood zone, wetlands, topography, soil;
  - survey, deed restrictions, mineral and water rights;
  - subdivision potential.
- **Commercial facts:**
  - building and leasable area, units;
  - occupancy, rent roll, lease terms;
  - gross operating income, operating expenses, NOI;
  - capital needs, taxes, market rent, market cap rate;
  - environmental, tenant diligence, zoning.
- A professional fact stays `needs_diligence` until a report is on file, whatever a provider says.
- **Provider facts are seeded** as `reported` at import (acreage, zoning, building area, units). Nothing a person entered is replaced.
- **Free public-record checks** (`POST /properties/:id/public-records`, `integrations/public-gis`):
  - FEMA's National Flood Hazard Layer (flood zones; recorded as `verified`);
  - the USFWS National Wetlands Inventory (recorded as `reported`, since a map is an indicator and only a delineation is definitive).
  - Both are queried over a box about the parcel's size around its coordinates, not its surveyed boundary. Both endpoints were checked live on 2026-11-03.
  - They are $0 providers in cost control (`fema_nfhl`, `usfws_nwi`; cached 90 days), and refused when external data is off.
- **Never invented:** rent rolls, occupancy, income and expenses come only from the seller's documents. Halo asks for them and does not fill them in.

## 5. Underwriting by asset class

`AssetUnderwritingService.forDeal` chooses the strategy by the property's asset class, never by a model. Every strategy returns `AssetUnderwriting` (`underwriting-types.ts`):
- a valuation range and the approaches behind it, with their evidence;
- confidence (from the evidence, never a model's self-rating);
- what is missing, risks and assumptions;
- the recommended offer range, target fee and expected buyer price;
- buyer demand (from the deal's ranked buyers);
- a decision (pursue, review or pass) with a one-line summary and a plain-language explanation.

Valuations are rounded to the precision the evidence supports: $1,000 under $100k, $5,000 under $1M, $25,000 above. `GET /deals/:id/asset-underwriting` reads it; `POST` records it on `underwriting_results` (`assetClass`, `strategy`, `analysis`).

### 5.1 Residential
The existing ARV model, unchanged (`disposition/underwriting.ts`). It is reported in the shared shape. An **unclassified** property uses it too, with a notice that the class needs confirming, and is never "pursue".

### 5.2 Land (`land-underwriting.ts`)
- **Comparables:** recorded land sales in the same county, within 36 months, between a third and three times the subject's acreage, arm's-length. Fewer than 3 is not a reliable value.
- **Value:** subject acres × the 25th, 50th and 75th percentile price per acre of the comparables.
- **Buyer price:** what matched land investors paid per acre in the county, from their recorded purchases, when there are 3 or more such sales. Otherwise an assumption of 75% of the low end of the value range, named in the result.
- **Offer:** buyer price − target fee − closing, diligence and holding costs. The range is 80% of that to that.
- **Decision:**
  - **pass** when no offer leaves room for the fee, or the parcel is landlocked;
  - **review** when there are too few comparables, confidence is low, legal access is not verified, or the parcel is in a high-risk flood zone;
  - otherwise **pursue**.
- The residential 70% rule is not used.

### 5.3 Commercial (`commercial-underwriting.ts`)
- **Income approach:**
  - **NOI** is stated, or derived as income − expenses when both are on file, at the weaker of their two statuses. Halo never assumes an expense ratio, an occupancy or a rent.
  - **Cap rate** must name its source (the `cap_rate` fact's source). Halo has no default.
  - **Value** = NOI / cap rate, ±0.5 point. A sensitivity grid (cap rate ±1 point, NOI −10%/−5%/0) is shown only when NOI is verified or reported.
- **Sales approach:** recorded sales of the same subtype in the county within 36 months, priced per square foot (per unit for multifamily).
- **Valuation:** the two approaches reconciled. A warning is raised if they differ by more than 25%.
- **Buyer price:** the low end of the value, less known capital needs, capped by a buyer's stated minimum yield when one is known.
- **With neither approach, there is no value.** The result lists the documents to request (T12, rent roll).
- **Decision:**
  - **pursue** only with verified NOI, a sourced cap rate and enough confidence;
  - **pass** when no offer leaves room;
  - otherwise **review**.

### 5.4 Offer bounds
For land and commercial deals, the seller offer a person sets (`POST /deals/:id/seller-offer`) is bounded by the top of the strategy's offer range, not the residential MAO. Above it, or while the deal needs review, a reason is required and audited.

## 6. Buyers

- **Recorded sales are classified as they are imported.** County exports can now map `landUse`, `zoning`, `acres`, `buildingSqft` and `units` columns.
- **Investor discovery** (`discoverInvestors`) adds to each candidate:
  - the asset classes and subtypes bought;
  - acreage and building-area ranges;
  - inferred categories: local land investor, land developer, builder or homebuilder, agricultural or recreational buyer, land investment company, commercial or multifamily investor, private investment company, acquisition firm, residential investor.
- **Categories come from the purchase mix first and the name second.** A name never overrides what a buyer actually bought. Every category carries `basis: "inferred"`.
- **Promotion keeps inference separate.** A promoted candidate's purchases become public-record transactions with their asset class. Its inferred categories are kept under `preferences.inferredCategories`, never as stated criteria.
- **Stated buy boxes** (`preferences`) can include asset classes and subtypes, counties, acreage, building area, units, zoning and a minimum cap rate.
- **Matching** (`buyer-ranking.ts`):
  - A land deal counts only land purchases as track record. A house deal ignores land and commercial purchases.
  - A stated class that excludes the deal is a mismatch. With nothing stated, purchases are the evidence, labelled "inferred interest, not confirmed".
  - Size fit (acres, area, units) and yield replace repairs and ARV for land and commercial deals.
- **Residential scores are unchanged** for buyers with no asset classes (a test pins it).
- A public-record investor is never treated as a qualified or interested buyer. Contact still needs consent, and every outreach is approved by a person.

## 7. Agents

- **Deal Underwriter:** for a land or commercial deal it asks the api for the strategy's result (`POST /internal/deals/:id/asset-underwriting`) and restates it: the strategy, the explanation, risks, what is missing and the assumptions (rule `asset_strategy`). It makes no model call and sets no number. A parcel with an APN and county is a valid subject. The residential prompt is unchanged.
- **All agents:** their context carries the property's asset class, APN, county, size, zoning and each fact with its status.
- **Prompt rules** (lead_analyst.v4, outreach_drafter.v2, disposition_matcher.v3, buyer_responder.v2, market_intelligence.v2, market_expansion.v3):
  - judge land and commercial leads on their own terms, never on house condition;
  - state a fact only if it is on file, saying "reported, not verified" unless it is verified;
  - answer buyers' questions on acreage, zoning, utilities, NOI, cap rates, occupancy and leases only from the facts, and otherwise say Halo has not verified it and offer to find out;
  - never quote ARV or repairs for land.
- **Market agents** see recorded sales and leads by asset class (`assetMix`). Market Expansion sees which classes a draft covers.
- **Approvals are unchanged:** every message, offer, contract and closing still needs a person. Consent, suppression and anti-spam controls are unchanged.
- **Not yet measured live:** the new prompt versions are checked against hand-written recorded replies only (golden set). No live eval was run: the repository has no `EVAL_OPENAI_API_KEY`, and this work made no paid calls. Run `npm run agents:eval -- --live` when a key is available.

## 8. Documents and diligence

- **Template versions carry asset classes** (residential, land, commercial or `ALL`) and optional transaction structures. A version uploaded before 2026-11-03 is residential.
- **Selection for a deal** (`TemplateCatalogService.selectApproved`):
  - the deal's state and asset class must both match;
  - this state is preferred to `ALL` states, then this class by name to `ALL` classes, then the most recently approved version wins;
  - residential, land and commercial deals never share an agreement unless a person marked the version for each;
  - an unclassified deal uses the templates every deal had before.
- **Generation refuses a deal with no approved template for its class**, saying which class.
- **Merge fields:**
  - `property_address` falls back to the parcel label (APN and county) for a parcel with no address;
  - `property_county`, `property_apn` and `property_acres` are filled from the property.
- **Nothing is generated as legal text or marked approved by Halo.** Counsel's or the owner's text is uploaded, and a person approves or accepts it.
- **Diligence checklists** (`diligence.ts`):
  - land: zoning, flood, legal access, utilities, title commitment, survey, restrictions, wetlands, mineral rights;
  - commercial: T12, rent roll, leases, taxes, Phase I environmental, property condition, title and ALTA survey, zoning, estoppels, service contracts.
  - An item is done when its fact is verified or a document on the deal is tagged `diligence:<item key>`.
- **Texas:** the equitable-interest notice (Prop. Code 5.0205, Occ. Code 1101.0045) is required before marketing every Texas deal, of every class, under any nationwide decision (`DisclosureGateService`). Whether more is required for land or commercial deals, here or in other states, is a question for counsel.

## 9. Markets

A market's policy names the asset classes it covers (`assetClasses`; residential for older policies), and requirements can be limited to classes. `MarketsService.evaluate(..., { assetClass })` and every gate (seller outreach, contracting, DocuSign, campaigns, buyer messages, eligibility) pass the deal's or lead's class. An unclassified property is gated as the market as a whole. The nationwide decision is scoped by activity and class and never waives a recorded requirement; see docs/markets.md s12.

## 10. Screens

- **Sourcing:** asset classes per market, per-class filters, the estimate (cost, data availability, research-only status), and a small batch on each market.
- **Lists:** leads, properties and deals filter by asset class (`?assetClass=residential|land|commercial|unclassified`). A parcel with no address shows as "Parcel …".
- **Deal page:**
  - the property's class, how it was decided, and a confirm or classify control;
  - the facts checklist with statuses and a record form;
  - the flood and wetlands check;
  - the diligence checklist;
  - the underwriting: decision first, plain-language explanation, valuation as a range.
- **Templates:** asset classes per version.
- **Markets:** the nationwide scope and what it never waives; each state lists what the decision overrides there.

## 11. Data sources and what they really return

Read from the adapters in this repository:

| Need | Realie | RentCast | Regrid | ATTOM | Public maps |
|---|---|---|---|---|---|
| Area search | state, city, ZIP, county; residential true/false; transferred since | city, state, ZIP; property type (including "Land") | not used for search here | not used for search here | n/a |
| APN, county, coordinates | yes | county, coordinates (documented, not seen live) | yes (documented) | yes | n/a |
| Acreage | yes | lot size (documented, not seen live) | yes (documented) | yes | n/a |
| Land use | county use code | type label | use description, zoning, structure flag (documented) | land-use label | n/a |
| Values, last sale, owner, absentee | yes | no | yes (documented) | yes | n/a |
| Tax delinquency, liens, foreclosure | yes | no | no | no | n/a |
| Building area | living area only | square footage | yes (documented) | yes | n/a |
| Flood zone, wetlands | no | no | no | no | FEMA NFHL, USFWS NWI (free, verified live) |
| Occupancy, rent roll, NOI | no | no | no | no | no: seller documents only |

"Documented" means the field is in the vendor's published schema and the adapter reads it, but no live response here has shown it yet. Regrid has no token configured.

**Not available from any configured source:** zoning for most parcels (Regrid would add it), parcel boundaries, utilities, easements, legal access, soils, slope. These are recorded by a person, from a document, or by a professional.

**A new paid provider is not added here.** Zoning and boundaries need a Regrid token or county GIS data licences; that is the owner's decision.

## 12. Tests

- **Shared** (`assets/assets.test.ts`):
  - classification (labels with building facts, multifamily by units, commercial land vs a commercial building, unclassified on conflicts);
  - parcel keys and labels, APN-only ATTOM and Regrid records;
  - land comparables, missing-fact safeguards, landlocked parcels;
  - commercial NOI and cap rate, sensitivity, and refusing missing NOI, expenses or cap rate;
  - the residential model unchanged;
  - diligence, sourcing criteria, land investor discovery, asset-aware matching, residential scores unchanged.
- **Market gate** (`markets/evaluate.test.ts`): the nationwide scope; requirements it cannot waive; policies by asset class.
- **API:**
  - sourcing: a land market starts manual, the small batch is capped, the estimate;
  - Texas disclosure under nationwide;
  - message and DocuSign gates pass the asset class.
- **Worker and golden set:** the Underwriter's land strategy without a model; a parcel without an address; land and commercial golden cases; a buyer question answered only from facts.
- **Real Postgres** (`test/integration/asset-classes.int-spec.ts`, the Texas acceptance list):
  1. a Texas land sourcing market with an asset-specific filter;
  2. five parcels ingested, deduplicated (within a pull and across overlapping markets), enriched and classified;
  3. a parcel with no street address stays usable;
  4. land valued from comparables, not the ARV formula, with the seller offer bounded by it;
  5. land investors discovered and ranked from transaction history;
  6. a commercial property analyzed on commercial metrics;
  7. NOI and expenses never invented;
  8. the recommendation names risks and unknowns;
  9. Texas templates chosen by asset class, with the Texas notice enforced under nationwide mode;
  10. no provider call, message or activation: cost control is a stub that refuses calls, the queue is stubbed, and the provider search and map service are stand-ins.

## 13. Limitations

- Land comparables are filtered, not adjusted: no adjustment for frontage, access or utilities between comparable parcels. Wide spreads lower confidence instead.
- The 75% land buyer ratio is an assumption until matched buyers have recorded purchases in the county.
- Commercial cap rates must be entered by a person with their source. Halo does not yet derive them from comparable sales, because recorded sales carry no NOI.
- Realie gives living area, not gross building area, so commercial size filters on Realie records are approximate. Its county use codes need a mapping per county.
- The flood and wetlands checks approximate the parcel as a square of its acreage around its coordinates.
- The asset gate judges an unclassified property as the market as a whole, the way every deal was judged before asset classes. Classify land and commercial deals before contracting.
"""
