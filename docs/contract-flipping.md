# Contract flipping

Halo's disposition engine: from a signed seller contract to a collected
assignment fee. Halo finds and ranks the buyers, prices the contract, sends
the outreach a person approved, takes the offers, prepares the assignment and
tracks the closing. A person makes every binding decision.

Status (2026-10-21): the backend, the gates and the lifecycle tests are in
place. The deal page and reporting UI are in progress; see s11 for what is
not operational yet.

## 1. Principles

1. **Nothing unknown is permission.** An unread assignment clause, a state
   whose rules nobody reviewed, terms nobody checked against the signed copy:
   each holds the deal in review, never in marketing.
2. **Halo owns the state; agents recommend.** Every row here is written by an
   api service that validates it. Agents read through the api and can only
   recommend accepting, countering or rejecting.
3. **People make the binding calls.** Verifying the contract, launching
   outreach, accepting or countering an offer, executing an assignment,
   confirming a closing and recording money need `deals:approve`.
4. **Money is deterministic.** Pricing, fees, floors and recommendations
   come from pure functions in `packages/shared/src/disposition`, never from
   a model.
5. **Projected is not realized.** A fee is revenue only under the tenant's
   recognition rule. Reports never add the two together.
6. **Never sell what we do not hold.** The gate is checked again at every
   buyer-facing step, including the moment a message leaves.

## 2. Lifecycle

```
negotiating --(seller contract recorded / sent)--> under_contract
under_contract --(executed + verified + gate passes)--> marketing
marketing --(campaign: ranked buyers, approved outreach, deal pages)--> offers
offer --(person accepts: buyer qualified, floor cleared)--> assignment draft
assignment --(executed copy recorded or DocuSign complete)--> assigned
assigned --(milestones done, settlement statement, person confirms)--> closed
closed --(fee recorded as received)--> revenue realized
assigned --(buyer walks / cannot fund)--> marketing   (while the contract lives)
any --(contract terminated, closing cancelled)--> lost
```

The deal stage machine (`packages/shared/src/state-machine/deal-stage.ts`)
gained `assigned -> marketing`. `DealsService.updateStage` now refuses:
- `marketing` unless the disposition gate passes;
- `assigned` without an executed assignment;
- `closed` without a confirmed closing.

The manual `PUT /deals/:id/stage` goes through the same checks.

## 3. The seller contract

`purchase_agreements` holds the terms Halo relies on:
- price, earnest money and its due date;
- inspection end and closing deadline;
- what the assignment clause says (`permitted`, `consent_required`, `prohibited` or `unknown`) and the seller's written consent when one is needed;
- the executed copy;
- a person's verification.

How an agreement gets there:
- **DocuSign.** An envelope's `purpose` is `purchase_agreement` when it goes to the seller alone, or when stated.
  - Sending it records the agreement as `sent`.
  - Completion records it `executed` with the signed copy and opens the closing file.
  - **Completion no longer moves the deal to marketing.**
  - Envelopes sent before `purpose` existed are treated the old way: a seller envelope is the purchase agreement.
- **By hand.** `POST /deals/:id/purchase-agreement` takes the terms as a draft, or as executed with the signed copy already in the library (e.g. a wet-ink contract).
- **Verification.** `POST /deals/:id/purchase-agreement/verify` needs `deals:approve`.
  - The person confirms each term against the signed copy: parties, property, price, earnest money, deadline, assignment clause and signatures.
  - The assignment clause must be recorded as something other than `unknown`.
  - Changing a verified term afterwards clears the verification.
  - If the gate then passes, the deal moves into marketing as that person. That is one action from signed to marketable.
- **Earnest money, extensions and termination.**
  - Earnest money: `/earnest-money` records the deposit.
  - Extensions: `/extend` needs the signed extension in the library.
  - Termination: `/terminate` ends every campaign and revokes every buyer link at once.

### Agreements from reviewed templates

The wording is the operator's (and counsel's); Halo fills only the blanks.

1. **Upload.** A template is a `.txt` file in the documents library (category `agreement_template`) with `{{field}}` blanks.
2. **Review.** A person with `compliance:write` marks it reviewed for a kind (`purchase_agreement` or `assignment`) and a state, or for every state, on the State Rules page. The blanks are checked at review: a template that asks for a field Halo cannot fill cannot be reviewed.
3. **Generate.** `POST /deals/:id/agreements/generate {kind}` fills the reviewed template for the deal's state (falling back to one for every state):
   - a purchase agreement from the recorded terms, before it is signed;
   - an assignment from the approved assignment, only while the deal is eligible.

   A blank with no value on record refuses the whole generation and names what is missing, so a half-filled agreement never reaches a signer.
4. **Send.** The result is a draft `.txt` document on the deal (tags `generated`, `draft:<kind>`), sent for signature from the Contracts card. DocuSign accepts text and the anchors work in it.

Fields are listed in `packages/shared/src/disposition/agreement-templates.ts`. `{{buyer_entity}}` and `{{assignor_entity}}` come from `HALO_CONTRACTING_ENTITY`.

## 4. State rules

`jurisdiction_policies` holds one row per state per tenant. It records what the operator, with counsel, has confirmed:
- whether assignment is allowed (`allowed`, `conditional`, `prohibited` or `unknown`), and the conditions;
- whether a double close is allowed;
- whether a licence is required, and the licence document;
- whether public marketing is allowed;
- the checklist documents buyers must receive (`buyerDisclosureKeys`);
- the references the review relied on, and when the review expires.

The rules:
- **Only `reviewed` policies count.** Without a reviewed policy for the deal's state, the deal is `review_required`.
- **A review must answer the two questions the gate turns on:** whether assignment is allowed, and whether a licence is required.
- **Editing a reviewed answer puts the policy back to draft.**
- **Templates are pointers, not answers.** `POST /compliance/jurisdictions/TX/from-template` pre-fills Texas's disclosure item and the statutes to check. Every legal question stays `unknown`.
- **The Texas equitable-interest gate stays in place.** Texas deals always need the notice on file (docs/documents-and-compliance.md), whatever the policy says.

### Tax-sale deals

A deal bought at a tax sale is `acquisitionType: tax_sale`. Recording its `tax_sale_interests` row (`PUT /deals/:id/tax-sale`) sets that. What the sale conveyed decides whether there is anything to sell:
- **A tax lien certificate is not ownership.** It is a right to be repaid, and the deal is blocked.
- **An auction bid is not ownership until the deed is issued.** Blocked.
- **A deed is blocked while the owner can still redeem,** and blocked for good if they did.
- **Everything else unknown is review:** the interest type, the end of the redemption period, title that is not yet insurable (clouded or needing a quiet-title action), whether the interest can be transferred.
- **A person verifies it** (`POST /deals/:id/tax-sale/verify`, `deals:approve`) against the deed and the county and title records. Verification is refused unless it is a deed, redemption is over, title is insurable, it is transferable and the deed or county record is on file.
- **Changing a verified fact clears the verification.**

The opportunity ranking marks an unverified tax-sale deal down, and the Contract tab carries the record and the verify button.

### The gate

`evaluateDispositionEligibility` (`packages/shared/src/disposition/eligibility.ts`) returns `eligible`, `blocked` or `review_required`. Each check says what was found and how to fix it.

| Check | Fails (blocked) | Needs review |
|---|---|---|
| Tax-sale interest (tax-sale deals only) | lien certificate, unconveyed bid, redeemed, redemption open, not transferable | nothing recorded, interest unknown, redemption end missing, title not insurable, transferability unknown, not verified |
| Seller contract executed | none, draft, sent, terminated, expired | |
| Executed copy on file | no signed copy | |
| Terms verified | | not verified |
| Contract may be assigned | prohibited; consent required without the consent | clause unknown |
| Contract still in force | deadline passed | deadline not recorded |
| Earnest money on time | due and not deposited | |
| State rules reviewed | policy prohibits | no policy, draft, lapsed, unknown answer, unknown state |
| Licence | required and not on file | unknown |
| Buyer disclosures | any required document missing | |
| No blocking issue | an open blocking title/closing issue | |

`DispositionEligibilityService.assertEligible` is called at each of these points:
- entering `marketing`;
- launching or resuming a campaign;
- serving a buyer page;
- countering or accepting an offer;
- sending an assignment envelope;
- executing an assignment;
- **at send time** for contract-marketing messages (`buyer_blast`, `disposition_outreach`, `disposition_follow_up`, `offer_counter`), in `MessageDispatchService`. A message approved yesterday cannot advertise a contract that expired overnight.

Replies to a buyer are not marketing and still go.

## 5. Buyers, campaigns, deal pages and offers

### Buyer intelligence

Buyers gained:
- **Status:** `active`, `inactive` or `do_not_market`.
- **Provenance:** `source` plus a detail.
- **Funding type.**
- **Proof of funds:** status, amount, document and expiry. Only `verified` counts, and verifying needs the document and the amount and `deals:approve`.
- **Notes.**
- **Purchase history** (`buyer_transactions`), each row tagged with where it came from:
  - `public_record` and `halo_closing` are evidence;
  - `buyer_provided` and `manual` are claims, weighed half.

`rankBuyersForDeal` (`packages/shared/src/disposition/buyer-ranking.ts`) scores out of 100:

| Factor | Max points |
|---|---|
| Location | 30 |
| Price | 20 |
| Property type | 5 |
| Condition limits | 5 |
| Nearby purchase track record | 15 |
| Verified funds | 15 |
| Engagement | 5 |
| Reliability | +5 to -10 |

Reliability is a Beta(1,1) prior on "closes once accepted". A buyer who walked away from an assignment loses points; one who closed with us gains a few. So the ranking learns from actual outcomes.

Every match lists its evidence by kind: stated preference, historical purchase, inferred capacity, verified or unverified proof of funds, expressed interest, offer, or closing. **Capacity is labelled an inference, and nothing turns a buy box into demand.**

A buyer cannot be offered a deal when they are:
- inactive or do-not-market;
- on the do-not-contact list;
- without any contact;
- without a consent on a channel we hold a contact for.

Consent:
- `POST /buyers/:id/consents` records it with its evidence.
- `POST /buyers/import` imports an authorized list. It records email consent only when the operator states how everyone on the list asked for deals.
- A buyer who ticks "email me deals" on a deal page is recorded with the page, the time and the IP address.

**Before this change no code created consent rows, so every buyer email was blocked with `MISSING_CONSENT`.**

### Campaigns

`POST /deals/:id/campaigns` prepares a draft. It is free and internal:
- pricing from the engine;
- a package draft;
- buyers ranked at the asking price, keeping only those contactable by email and not outside their stated area;
- the outreach text, with `{{name}}`, `{{why}}` and `{{link}}` filled per buyer.

`POST /campaigns/:id/launch` (`deals:approve`) is the one approval for outreach. It:
1. checks the gate and the floor;
2. approves the package;
3. creates one link per buyer;
4. creates each email through `CommunicationsService`, which checks consent, DNC and quiet hours, and approves it as that person.

Every check runs again at send time. If nothing can be sent, the campaign stays a draft and the reasons are returned.

The sweep keeps campaigns honest:
- Follow-ups for buyers who have not answered are **drafts for approval**, never automatic.
- A campaign expires when its time is up or the contract stops being marketable, and its links are revoked.
- Accepting an offer pauses outreach; a cancelled assignment resumes it.

### Deal packages and buyer pages

`deal_packages` are versioned and approved by a person. They are built from a whitelist:
- the asking price;
- property facts, with their provider named;
- ARV and repairs labelled as estimates, with a low-confidence ARV marked unconfirmed (`minUnderwritingConfidence`);
- comparables a person entered;
- known risks;
- the close-by date;
- a statement of exactly what is sold: an assignment of a contract, not a deed;
- standard disclosures;
- shared documents: tagged `buyer_shareable`, or a disclosure checklist item.

As a safety net, no number in a package may equal the contract price or the offer made to the seller.

Buyer links:
- They are `/p/deals/<token>` on the web app (`PUBLIC_APP_URL`).
- Only the sha256 of the token is stored.
- A link dies when it expires, is revoked, its campaign ends or the deal stops being eligible. It then answers "no longer available" with no detail.
- Buyers always see the current approved package.

Public routes are rate limited:
- `GET /public/deal-pages/:token`
- `GET /public/deal-pages/:token/files/:documentId` (only files on the package)
- `POST /public/deal-pages/:token/respond`: interested, offer (after acknowledging the disclosures), not interested, or unsubscribe (DNC entry and do-not-market).

### Offers and pricing

`buyer_offers` record:
- the buyer's total price;
- kind: `indication` or `written_offer`;
- source;
- who captured it: a person, the buyer on the page, or an agent reading an email. An agent-captured amount must be confirmed before it can be accepted.
- earnest money, close-by date, financing, conditions and expiry.

A buyer's newer offer supersedes their open one.

`recommendAssignmentPricing` (`packages/shared/src/disposition/fee-pricing.ts`) works out these figures:
- **Floor:** contract price + minimum net profit + our costs.
- **Target:** contract price + the deal's or tenant's fee.
- **Investor ceiling:** ARV x 0.70 - repairs. A spread that cannot clear the floor is flagged.
- **Demand:** `none`, `low`, `moderate` or `strong`, from open written offers, interest and contacts.
- **Recommended asking price:** the target, held to the ceiling, raised to the best written offer, and lowered toward the floor near the deadline when demand is thin.
- **Per-offer recommendation:** accept, counter (with an amount), hold (a backup or an indication) or reject, with the implied fee and net and the reasons.

Prices are quoted to $500, and floors are rounded up.

Decisions (`deals:approve`):
- **Counter:** refused below the floor. It optionally emails the buyer through the pipeline.
- **Reject.**
- **Accept.** Each refusal says what to do. Accepting requires:
  - the offer is open, written and confirmed;
  - the deal is eligible;
  - the buyer is active and not opted out;
  - the buyer's verified, unexpired proof of funds covers the price (`requireVerifiedPof`, on by default; otherwise refused as `UNQUALIFIED_BUYER`);
  - the price exceeds the contract price;
  - the net clears `minNetProfit`, or a reason is given (refused as `BELOW_MINIMUM_PROFIT` without one);
  - for a double close, a reviewed policy that allows it.

  Accepting prepares an assignment draft, pauses outreach and keeps the other offers as backups.

## 6. Assignment, closing and the fee

**The closing file.** `closing_files` opens when the seller contract is executed: title work starts then. Its milestones come from `milestoneTemplate`:
- **Common:** title opened, our earnest money, title commitment.
- **Assignment:** assignment signed, delivered to the closing agent, buyer deposit, buyer funds verified, title clear, closing scheduled, settlement reviewed.
- **Double close:** the resale contract, transactional funding, disclosure to title, then the same buyer and title steps.

Due dates follow the file's own dates: when it opened, when the assignment was executed, and the scheduled closing.

**Issues.** `closing_issues` can be blocking or a warning. A blocking issue:
- blocks the closing;
- blocks the disposition gate;
- reopens "title clear" if it is a title issue.

**The assignment.** `assignment_agreements` is created only from an accepted offer.
- It is sent through DocuSign with `purpose: assignment` and its `assignmentId`: only to that buyer, only while the deal is eligible.
- Halo never signs it.
- **Executed:** recorded with the signed copy, or when DocuSign completes. The gate is checked one last time. The deal becomes `assigned`, campaigns complete and links are revoked.
- **Cancelled:** a buyer default is recorded against the buyer, the buyer-specific milestones reset, and the deal returns to marketing if the contract is still good.

**Closing.** `POST /deals/:id/closing/confirm` (`deals:approve`):
- Needs the settlement statement in the library and the fee shown on it.
- Is refused while anything blocking is pending, or if the closing date is after the contract deadline.
- Closes the deal and records the closing as a verified purchase for the buyer.

**Revenue** follows `revenueRecognition`:
- `on_funds_received` (default): the fee is revenue only once `/closing/fee-received` records the money.
- `on_closing_confirmed`: it is revenue once the closing is confirmed.

Until then `deal_economics.revenueStatus` is `projected`. A cancelled closing marks it `lost`.

**Halo never moves or releases money.**

**The sweep.** The hourly `DispositionSweepService` (`DISPOSITION_SWEEP`, `DISPOSITION_SWEEP_HOUR_UTC`) does the transaction coordinator's clock work:
- expires campaigns and offers;
- once a day per item, raises a timeline note and an ops alert for overdue milestones, blocking issues, passing deadlines, and a closing scheduled after the deadline;
- drafts buyer follow-ups daily.

## 7. Deal Command Center and reporting

- `GET /deals/:id/workspace` returns everything on one deal, in one read:
  - eligibility with every check;
  - the agreement, closing file and readiness;
  - campaigns, offers with recommendations, pricing, buyer matches with explanations, packages and links;
  - assignments, and pending approvals (agent runs and message drafts);
  - projected versus realized economics;
  - **`nextActions`**, the few actions that move the deal, in priority order.
- `GET /command-center/attention` returns the same actions across every active deal, plus closed deals whose fee has not arrived.
- `GET /command-center/portfolio` covers:
  - **pipeline:** active opportunities, under contract, awaiting verification;
  - **disposition conversion:** campaigns, buyers contacted and interested, deals with offers, accepted, closed, offer and close rates;
  - **money,** kept apart: projected (accepted, not closed), closed awaiting funds, realized;
  - **speed:** days from contract to close;
  - **failures:** cancelled assignments, buyer defaults, cancelled closings, terminated contracts, expired campaigns;
  - **agent performance:** runs, approvals, rejections, failures, cost.
- `GET /command-center/opportunities` ranks deals before contract (`rankOpportunities`, `packages/shared/src/disposition/opportunity-ranking.ts`). Every point comes from a recorded fact named in the reasons:
  - **acquisition** (up to 30): the Lead Analyst's score, and whether the seller is replying;
  - **margin** (up to 30): the expected net from the deterministic underwriting against the minimum profit; a pass scores nothing;
  - **demand** (up to 20): contactable buyers who fit, strongly or at all; no fit, no points;
  - **velocity** (up to 10): how recent the last activity was;
  - **risk** (down to -36): numbers that need review, open title issues, no way to reach the seller, a tax-sale interest not yet verified.

### Underwriting

The Deal Underwriter supplies the judgement: ARV, repairs and a confidence. `underwriteDeal` (`packages/shared/src/disposition/underwriting.ts`) does the arithmetic:

| Figure | How it is computed |
|---|---|
| Investor max | ARV x 0.70 - repairs |
| MAO | investor max - the fee |
| Offer range | 85% of the MAO up to the MAO |
| Expected profit | at the contract price once there is one, else at the MAO |

- **Downside scenarios:** ARV 10% lower, repairs 25% higher, and both, each with our net at the planned price.
- **Recommendation:** `offer`, `pass` (no positive MAO, or a contract above the MAO that misses the minimum), or `needs_review` (low or missing confidence, repairs not estimated).
- **Downside results are warnings,** not review triggers: at the MAO the combined downside nearly always loses, which is what the margin is for.
- **The model never sets the MAO.** When the Underwriter reports, the MAO written to the deal is this one. The model's own MAO and offer range are kept in `underwriting_results.evaluationMetadata` (`modelMao`, `modelOfferRange`) for comparison.
- `GET /deals/:id/underwriting` returns it for the deal as it stands, and the workspace includes it.
- **The offer to the seller stays inside policy.** `POST /deals/:id/seller-offer` (`deals:approve`, before contract) runs the shared `negotiationBoundsRule` against this MAO. An offer above the MAO, or set while the numbers need review, is refused unless the person gives a reason. The amount, the MAO, what was outside policy and the reason go in the audit log.

## 8. Agents

The runtime is still the TypeScript worker. `docs/agent-design.md` s9 records that decision (2026-10-12); CrewAI (`apps/agents`) remains the escape hatch behind the same `AgentDecision` contract. The roster maps like this:

| Role in the brief | Where it lives |
|---|---|
| Acquisition / Property Intelligence | Lead Analyst, sourcing markets, enrichment |
| Underwriting | Deal Underwriter (numbers) + `fee-pricing.ts` (deterministic) |
| Seller Relations / Negotiation (seller side) | Outreach Drafter |
| Contract | `PurchaseAgreementsService` + verification (deterministic) |
| Buyer Intelligence | `rankBuyersForDeal` + `BuyerIntelligenceService` (deterministic) |
| Disposition | Disposition Matcher, Buyer Responder, `CampaignsService`, `OffersService` |
| Transaction Coordinator | `ClosingService` + `DispositionSweepService` (deterministic) |
| Compliance | the disposition gate, jurisdiction policies, consent/DNC/quiet hours (deterministic) |

Roles that need no judgement are deterministic services, not models. Where an agent adds value, it captures facts as agent-captured, for a person to confirm:

- **Buyer Responder.** When it reads a price in a buyer's reply, it records `record_buyer_offer`: a `written_offer` when the buyer offered, an `indication` otherwise. The offer cannot be accepted until a person confirms the amount.
- **Disposition Matcher.** Approving one of its blasts checks the gate, and is refused while a campaign is already running for the deal.

## 9. Tests

- **Shared** (`packages/shared/src/disposition/*.test.ts`): the gate, ranking, pricing, closing readiness, revenue recognition and offer transitions.
- **API unit:**
  - stage preconditions;
  - DocuSign purposes;
  - the send-time gate.
- **Lifecycle against a real Postgres** (`apps/api/test/integration/contract-flipping.int-spec.ts`). It covers the full flip from executed contract to realized fee, and each failure:
  - an assignment restriction;
  - an unread clause;
  - a title blocker;
  - a rejected lowball;
  - an unqualified buyer;
  - below-minimum acceptance;
  - an agent-read amount;
  - an expired contract;
  - a buyer default with re-marketing;
  - a cancelled closing;
  - the Texas notice;
  - a seller figure typed into a package;
  - an agreement generated from an unreviewed or incomplete template;
  - two people accepting different offers at once, and two launches of one campaign;
  - a seller offer above the MAO;
  - a tax-sale lien certificate, an open redemption period, and a verified deed;
  - the attention list.

  Every fixture is **synthetic**, on a throwaway tenant, and nothing is sent: the queue is stubbed. CI runs it in the migration job. Locally:

  ```bash
  INTEGRATION_DATABASE_URL=postgresql://... npm run test:integration -w @halo/api
  ```

  Point it at a scratch database only.

## 10. Configuration and permissions

| Setting | Where | Default |
|---|---|---|
| `minNetProfit`, `dispositionCosts`, `defaultAssignmentFee` | control plane (`PUT /control-plane`) | 5000, 0, 10000 |
| `minUnderwritingConfidence` | control plane | 0.5 |
| `requireVerifiedPof` | control plane | true |
| `revenueRecognition` | control plane | `on_funds_received` |
| `campaignFollowUpDays`, `campaignMaxFollowUps` | control plane | 3, 2 |
| `PUBLIC_APP_URL` | env | first `CORS_ORIGINS` entry |
| `DISPOSITION_SWEEP`, `DISPOSITION_SWEEP_HOUR_UTC` | env | on, 13 |

Permissions:
- `deals:approve`: set the offer to the seller; verify a tax-sale interest; verify, extend or terminate a contract; launch or resume a campaign; approve a package; counter, reject or accept an offer; verify proof of funds; execute or cancel an assignment; confirm a closing; record the fee; cancel a closing.
- `compliance:write`: edit or review jurisdiction policies.

Tenant admins have both.

## 11. Not operational yet

- **Contract text is the operator's.** Halo fills blanks; it never writes clauses. Templates must be plain text (.txt); Word templates are sent as they are, unfilled. Generated agreements are drafts a person reads before sending for signature.
- **State rules start empty by design.** No state is marketable until its policy is reviewed.
- **Email delivery needs `EMAIL_FROM`, `EMAIL_POSTAL_ADDRESS`, `PUBLIC_API_URL` and `PUBLIC_APP_URL`, and the email switch on.** Until then, launches are refused at creation with the reason.
- **Buyer sourcing from public records is manual.** Purchases are entered with their recording reference; no deed-records provider is integrated.
- **Buyer replies by text are not linked to buyers.** Email only.
- **Tax-sale facts are entered by hand.** No county auction or redemption feed is integrated, and no state's redemption rules are encoded: the dates come from the county records.

## 12. Audit, 2026-10-21

What existed:
- the five TypeScript agents and their golden eval;
- the approval queues;
- DocuSign from the library;
- the Texas disclosure gate;
- buyer price protection;
- buyer CRUD with a free-form buy box;
- deal economics with no projected/realized split.

What was missing, and is now built:
- the executed-and-verified contract gate;
- jurisdiction policies;
- structured buyer evidence and consent;
- campaigns, packages and buyer pages;
- structured offers and deterministic pricing;
- assignments, closing files, milestones and issues;
- revenue recognition;
- the workspace and attention and portfolio reads;
- real-database lifecycle tests.

Found along the way:
- **Fixed: seller drafts from approved agent runs never reached the approval queue.** They were created as `draft` and nothing submitted them; they are now submitted on approval.

Still open:
- **`agentAutonomy` gates only rule-based lead transitions.** Scores, notes, numbers and rankings apply in both tiers, unlike docs/agent-design.md s5.
- **Deals, buyers, documents and communications routes have no role checks.** Only the new binding steps require `deals:approve`.
