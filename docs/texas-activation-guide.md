# Texas first: activating land and commercial wholesaling

This is the order to go from nothing to a first Texas land deal. It is written for someone who has not wholesaled before. Each step says what Halo does on its own and what only you can do. Halo never does the second kind for you: it does not sign up for services, pay for them, decide legal questions, contact anyone without your approval, or turn a market on.

Background: docs/asset-classes.md (how land and commercial deals work in Halo) and docs/markets.md (how a state is opened).

## What Halo does on its own

- **Finds parcels** in the counties you choose, filtered by acreage, vacancy, ownership and distress. It reads only the fields the data provider returns.
- **Classifies each parcel** as residential, land or commercial from what is on the record, and leaves it unclassified when the record does not say.
- **Drops duplicates**, even when two sourcing markets overlap or a parcel has no street address.
- **Checks the free federal maps** for flood zones and wetlands.
- **Values land** from what comparable land sold for per acre in the county, and **commercial property** from verified income and comparable sales. It says what is missing instead of guessing.
- **Finds likely buyers** from recorded purchases (land investors, builders, developers) and ranks them for each deal. It marks every one as an inference until the buyer confirms.
- **Drafts messages and explains each recommendation.** A person approves anything that goes out.

## What only you can do

| What | Why | Where |
|---|---|---|
| Keep a property-data account funded (Realie; RentCast for listed land) | Every search page costs a token | Realie and RentCast billing; key on Admin → Integrations |
| Set spending limits | Caps what sourcing and enrichment can spend | Admin → Cost Governance |
| Get recorded sales for your counties | Land is valued from comparable sales, and buyers are found from them | A county export (CSV) you are licensed to use, imported on Buyer Discovery, or ATTOM sales |
| Decide the legal basis for Texas | Halo never decides the law | Market Activation → Texas: counsel's approval, your risk acceptance, or the nationwide decision |
| Record Texas registrations | A requirement of law blocks the activity until it is on file | Market Activation → Texas → Licences |
| Supply land (and commercial) agreements | Halo never writes legal text | Paperwork → Templates; mark each for land or commercial |
| Supply the Texas equitable-interest notice | Required before any Texas contract is marketed | Paperwork → Documents, attached to the deal |
| Turn on contact channels | Email and texts stay off until you turn them on | Admin → Control Plane |
| Skip-trace account | To reach owners: county records do not include phones or emails | Admin → Integrations (BatchSkipTracing) |
| Texts: Twilio number and A2P 10DLC registration | Carriers require registration; it takes weeks | Twilio |
| Do Not Call data | Marketing texts need it, or that requirement changed | Admin → Control Plane |
| A title company | It runs diligence on title and closes the deal | Outside Halo |
| Approve every offer, message, contract and closing | Halo recommends; a person decides | Each deal's Approvals tab |

## Step by step

### 1. Research only (safe to start today)

1. **Check the data account.** Admin → Integrations should show Realie configured. Realie charges one token per page of up to 100 parcels; a search that finds nothing is free.
2. **Set a spending cap** on Admin → Cost Governance, for example $5 a day for Realie while you test.
3. **Create a Texas land market.** Go to Acquisitions → Sourcing → Add market:
   - state TX, asset class **Land**;
   - one county, for example Bastrop (the county is required when there is no city);
   - filters, for example at least 5 acres, vacant only, absentee owner.
   - Read the estimate before saving: the most a run can cost, which filters Realie applies itself and which Halo applies after the pull (you still pay for those pages), and "Research only for land in TX". A land market starts **manual**: it never runs on a schedule until you change that.
4. **Run a small batch.** Use "Run a small batch" with 5 to 10 records. The result shows what was kept, what was set aside and why, and how many records Halo could not classify.
5. **Review the parcels.**
   - Leads → filter Land.
   - Open each deal or lead you care about. On the Property tab, confirm the class where Halo marked it unclassified.
   - If many parcels carry the same county code, use "Apply this to every code in the county" once instead of confirming each one.
6. **Check flood and wetlands** on each parcel's Property tab. It is free and fills two facts from the federal maps.
7. **Load comparable sales** for the county: Dispositions → Buyer Discovery → import the county's recorded-sales export, mapping acreage and land use if the file has them. Without them, Halo cannot value land and says so.
8. **Find buyers.** Buyer Discovery → refresh for TX. Review the land investors it found, then promote the ones worth calling. Each is an inference from what they bought, not a confirmed buyer.

You can stop here and keep researching as long as you like. Nothing above contacts anyone.

### 2. Before contacting sellers

9. **Decide the legal basis for Texas,** one of:
   - counsel approves a Texas policy that covers land (the policy lists the asset classes it covers);
   - you accept the policy yourself (labelled "Owner-accepted, not counsel-approved");
   - you open seller outreach nationwide for land (Market Activation → Operate in every state, choosing only the activities and classes you want).
10. **Record what the policy requires** on Market Activation → Texas → Licences, for example a foreign LLC registration with the Texas Secretary of State. Until it is recorded, the activity it covers stays blocked, under any decision.
11. **Turn on reaching owners:**
    - a skip-trace key, so leads get phone numbers and emails;
    - email turned on (texts need Twilio and A2P registration first);
    - consent recorded where it is required.
    - Halo still checks Do Not Call, quiet hours and opt-outs on every message.

### 3. Before signing a contract

12. **Upload your Texas land purchase agreement and assignment agreement** on Paperwork → Templates, marked **Land**, for TX. Approve them with counsel's approval, or accept them yourself. Halo will not use a residential agreement for a land deal.
13. **Do the land diligence** listed on the deal's Property tab: legal access through title work, utilities (a will-serve letter or a perc test), zoning, survey, deed restrictions, mineral rights. Halo lowers its confidence and holds its recommendation at "review" until access is verified.
14. **Offer within the range.** The offer to the seller is bounded by the land offer range on the deal. Going above it asks you for a reason, which is recorded.

### 4. Before marketing to buyers and closing

15. **Attach the Texas equitable-interest notice** to the deal (Prop. Code 5.0205, Occ. Code 1101.0045). Halo blocks buyer marketing for a Texas deal without it, under any decision.
16. **Open the rest:** buyer marketing and assignment, through the policy or the nationwide decision. Configure DocuSign, choose a title company, then approve the buyer campaign. Every message is approved by a person.

## Commercial

The same order applies, with commercial in place of land:
- **Sourcing:** choose Commercial with building size, units or year built.
- **Valuation:** it needs the seller's trailing-12-month operating statement and rent roll, and a market cap rate with its source. Halo never assumes income, expenses, occupancy or a cap rate. Without them it shows no value and lists what to request.
- **Diligence:** environmental (Phase I), leases and estoppels.
- **Legal:** whether Texas, or any other state, treats commercial assignments differently is a question for counsel, as it is for land.
