# Markets

Hālo is built to operate in every US jurisdiction: the 50 states and DC. It operates in each one only as far as counsel has approved and a person has decided. This document describes how that works:
- the market record;
- the research behind each draft policy;
- counsel's approval;
- the activation ladder;
- the gates that enforce it;
- document templates;
- the self-test.

Code:
- shared logic: `packages/shared/src/markets/`;
- API: `apps/api/src/markets/` and `apps/api/src/templates/`;
- web: `apps/web/app/(app)/markets/` and `apps/web/app/(app)/templates/`.

## 1. Principles

- **Every jurisdiction has a market.** The 51 rows exist for every tenant. None is enabled by default.
- **Unknown never means allowed.** An unanswered question, an unreviewed policy, a missing template or an unverified licence each stop the activity they bear on.
- **Research is a lead, not a conclusion.** Bundled research only ever fills a *draft*. Nothing a draft says permits anything.
- **The gates rely on counsel's approved version, never on the draft.** A draft can change while the approved version stays in force.
- **Nothing promotes itself.** A person chooses each rung of the ladder. Halo refuses a rung the approved policy and the requirements on file do not support. When something lapses, the market drops automatically.
- **No region is special-cased in code.** Differences between states live in policy content: answers, structures, channels, disclosures, deadlines and requirements. The one exception predates this work: Texas's built-in equitable-interest notice (docs/documents-and-compliance.md), which the Texas policy also lists.

## 2. Coverage: three measures, kept apart

The Market Activation page reports three numbers. They are counted independently.

| Measure | A jurisdiction counts when |
|---|---|
| **Research coverage** | Research or a draft policy is on file **and** Hālo can pull property data there: a nationwide provider key (ATTOM, Realie, RentCast, Regrid) or a sourcing market in the state. |
| **Technical readiness** | Its disclosures and cancellation rules are encoded, purchase and assignment templates (and any disclosure templates) with valid merge fields apply to it, and the self-test passes. Legal approval is not required. |
| **Active transaction markets** | Its effective status is `ACTIVE`. The page also shows how many may sign seller contracts (`APPROVED_FOR_ACQUISITION` or higher). |

A market can be research-covered without being technically ready, and technically ready without being legally approved. Technical readiness never promotes a market.

## 3. The activation ladder and the gates

`evaluateMarket` (`packages/shared/src/markets/evaluate.ts`) decides from the records. It separates three things:
- **legal:** what counsel approved (an immutable version);
- **readiness:** templates, authorizations, an operator, a self-test;
- **activation:** what a person asked for.

| Status | What it allows | What it needs |
|---|---|---|
| `RESEARCH_ONLY` | research, sourcing, underwriting | nothing |
| `PENDING_LEGAL_REVIEW` | the same | a draft submitted to counsel, or a lapsed approval |
| `PENDING_REQUIREMENTS` | the same | an approved policy; requirements outstanding (or all met and waiting for a person) |
| `APPROVED_FOR_ACQUISITION` | + contacting sellers, signing purchase agreements, closing | classification A–D; an approved purchase-agreement template; approved seller-disclosure templates; authorizations that apply to seller activity |
| `APPROVED_FOR_DISPOSITION` | + marketing to buyers, assigning, double closing | a permitted structure with its template and authorizations; a permitted channel; approved buyer-disclosure templates; authorizations that apply to marketing |
| `ACTIVE` | + agents acting without a person starting each step | an operator responsible for the market; a self-test passed within 30 days and not stale |
| `RESTRICTED` | research, and closing contracts already signed | a person's decision (always accepted) |
| `BLOCKED` | research only | a person's decision (always accepted) |

- **The effective status is the lower of the two.** It is the lower of what a person set and what the approval and requirements support.
- **Below the first approval rung, the pending statuses show progress.**
- **Setting `RESTRICTED`, `BLOCKED` or anything below disposition pauses the market's live campaigns.**
- **A classification-E policy keeps the market at research only.**

### Where each activity is enforced

| Activity | Gate |
|---|---|
| Recording a seller contract | `PurchaseAgreementsService.record` → `seller_contracting` |
| Sending a purchase agreement for signature | `DocuSignService.createEnvelope` → `seller_contracting` |
| Any outbound message to a seller | `MessageDispatchService`, at send time → `seller_outreach` |
| Buyer marketing messages | `MessageDispatchService`, at send time → the channel (`investor_email` or `investor_sms`) |
| Launching a campaign | `CampaignsService.approveAndLaunch` → `investor_email` and `buyer_deal_page` |
| Serving a buyer deal page | `ShareLinksService.resolve` → `buyer_deal_page`; a refusal is a plain "no longer available" |
| Marketing and assigning (the disposition gate) | `evaluateDispositionEligibility`: the market's buyer marketing, the planned structure, missing authorizations, the seller cancellation window, and the policy's buyer disclosures |
| Accepting an offer, changing the closing structure | `assertStructureAllowed` → `assignment` or `double_close` |
| Generating a document | the activity of its kind (`TemplatesService.generate`) |

A refusal is a 403 with `reason: MARKET_NOT_AUTHORIZED`. It names the state, the status and what is missing.

## 4. Research

`apps/api/src/markets/research-data.ts` bundles research for all 51 jurisdictions, gathered 2026-10-22 from public sources:
- statutes;
- real-estate commission rules and guidance;
- bills;
- a few secondary sources, marked as such.

Each record:
- answers the eleven market questions (`MARKET_QUESTIONS`) with yes, no, conditional or unknown, citing the sources it relied on;
- proposes a classification (A–E) with its rationale;
- lists pending legislation, open questions for counsel, and steps to activate;
- states its confidence. Of the 51: 11 high, 16 medium, 24 low. Some western and northeastern states are thin because the research hit a search limit; those say so and are mostly E.

`POST /markets/research/import` converts each record into a draft (`draftFromResearch`). The rules:
- A draft a person has edited since the last import, or one with counsel, is left alone unless `overwrite` is set.
- Unknowns stay unknown.
- Text marketing is always conditional on federal TCPA consent.
- Disclosures are generated by templates of the matching kind.
- Cancellation rights become windows that hold marketing.
- Registration, licence and foreign-entity answers become requirements.

**Research is not legal advice.** Every draft says it was not reviewed by counsel.

## 5. Deadlines

`packages/shared/src/markets/deadlines.ts` counts statutory windows in the jurisdiction's time zone:
- **Counting:** the trigger day is day 0, and the deadline is the end of day N.
- **Business days** skip weekends and US federal holidays, on their observed days.
- **State holidays are not applied.** A policy that needs them should shorten the window.
- **Split states:** each state has one zone, where most of its population is. For deals in a split state's other zone this is an approximation.

A seller cancellation window from the approved policy:
- holds buyer marketing (`cancellation_period` in the disposition gate) until it closes;
- fills `{{seller_cancellation_days}}` and `{{cancellation_deadline}}` in templates.

## 6. Templates

Templates are counsel's text with `{{field}}` blanks, as `.docx` (filled with docxtemplater) or `.txt`.

**Kinds:**
- purchase agreement;
- assignment agreement;
- seller disclosure;
- buyer disclosure;
- cancellation notice;
- other notice.

`TEMPLATE_FIELDS` lists what each kind may use, and `REQUIRED_TEMPLATE_FIELDS` what every template of the kind must contain.

**The rules:**
- **Upload creates a version.** The file's hash, its fields, and any unknown or missing required fields are recorded. A clean version is `validated`; anything else stays `draft`.
- **Approval names counsel and the states.** It requires counsel's name, the approval document, the states, and that the file is unchanged since upload. A starter scaffold cannot be approved. Approving supersedes the template's earlier approved version.
- **Selection:** a deal uses the newest approved version for its state. One written for the state wins over one approved for `ALL`.
- **Generation:**
  - fills the template from Hālo's records and refuses when any used field has no value;
  - stores the document on the deal as a draft for review;
  - makes a PDF (text templates are drawn with pdf-lib; Word documents go through Gotenberg at `PDF_CONVERTER_URL`, and when that is not configured the `.docx` is kept, which DocuSign accepts);
  - records a `DocumentGeneration` holding the values used.
- **Starter scaffolds** (`POST /templates/starter`) show the merge-field layout with every clause marked `[COUNSEL]`. They apply to no jurisdiction and do not count toward readiness.

Hālo never writes clauses and never marks a template approved by itself.

## 7. Self-test

`POST /markets/:state/self-test` proves the encoded rules do what they say, without touching a deal:
- the disposition gate holds marketing while each required buyer disclosure is missing, and releases it when they are on file;
- each seller cancellation window holds marketing during the window and releases it afterwards, with the dates it computed;
- the evaluator allows exactly the structures and channels the policy permits;
- every applicable template fills every blank with synthetic values, and makes a PDF where possible.

A change to the policy, a template or an authorization marks the result stale. `ACTIVE` needs a fresh pass.

## 8. Verifying a signed contract

Verification is the step after DocuSign completes. It still needs a person:
- **The confirmations:** every term matches; signatures; the assignment clause; that the agreement is legally sufficient for the state; that the seller received every disclosure the state requires.
- **Automated checks first** (`GET /deals/:id/purchase-agreement/checks`):
  - the approved policy's seller disclosures are on file (this one blocks verification);
  - whether it was signed through DocuSign;
  - whether it was generated from an approved template.
- The result, including the automated checks, is stored with the verification.

DocuSign completion never moves a deal into marketing.

## 9. Tests

- **Shared:** `markets/*.test.ts` covers deadlines and holidays, the evaluator (ladder, lapse, E, restricted, channels, coverage) and the research import. The disposition gate tests cover the market checks and the cancellation window.
- **API unit:**
  - the research bundle covers all 51 jurisdictions, converts cleanly and cites a source for every answer;
  - dispatch blocks seller outreach and marketing channels a market does not allow.
- **Real Postgres** (`test/integration/markets.int-spec.ts`):
  - research import for 51 jurisdictions;
  - approval rules and immutable versions;
  - the ladder with templates, authorizations, operator and self-test;
  - restriction pausing campaigns;
  - a business-day cancellation window;
  - channel refusal;
  - lapse and class E;
  - technical readiness without approval.

  `contract-flipping.int-spec.ts` runs the full flip in approved markets, including template generation as `.docx` and `.txt` with PDFs.

## 10. Permissions

| Permission | Allows |
|---|---|
| `compliance:write` | editing drafts, submitting them, recording authorizations, importing research, uploading templates, the self-test |
| `compliance:approve` | recording counsel's approval of a policy or template, verifying an authorization, returning a draft from review |
| `markets:activate` | setting a market's status and its operator |

Tenant admins have all three. The two new permissions must be added to the identity provider's roles for anyone else.

## 11. The Market Expansion agent

The agent prepares a state for counsel. It reads the market's draft, the questions the draft leaves unknown and the bundled research. It proposes:
- answers to those questions, each citing a source the draft or the research holds;
- questions for counsel;
- licences and registrations to track;
- a class;
- the steps from here to a first lawful transaction;
- the risks.

Ask for a proposal on the market's **Expansion agent** tab. The proposal also appears in the Agents approval queue.

**It never self-approves.** Its only action is a proposal that waits for a person (`deals:approve`). Accepting it writes into the editable draft and nowhere else. The draft then goes through the same submit and counsel approval as any other. No action exists that submits, approves, activates or changes a status.

Rules enforced in code, whatever the model writes (`sanitizeMarketProposal`, then `applyMarketProposal` against the draft as it is at approval):

| Rule | Effect |
|---|---|
| Only unknown questions | An answer a person or counsel gave is never overwritten. One given between the run and the approval wins. |
| Unknown is never permission | A yes, no or conditional with no source the context holds becomes unknown, and a made-up source id is dropped. |
| No permissive class on open questions | Class A or B is not proposed while a question an approval needs is unknown. A class that differs from one a person set becomes a counsel question, not a change. |
| Marked unverified | Every answer it adds carries "Proposed by the Market Expansion agent, not verified; counsel to confirm" and the run id. |
| Sources from the research | A source it adds comes from the bundled research by id, never from the run's own copy. |
| Not while counsel has the draft | Approval is refused while the draft is in review. The run stays open. |
| No clearance claims | A reply that says a market is legal, approved, cleared or safe to operate in is refused, not recorded. |

The agent also holds without asking a model when:
- a person blocked or restricted the market;
- counsel is reviewing the draft;
- the market is already active;
- there is no research;
- the draft has no unknowns.

**Not yet: web research.** The agent works from the bundled research and the sources already cited. It does not search the web or read statutes it was not given. Fresh research needs a search-capable model route, which is not built.

## 12. Not operational yet

- **No market is approved.** Counsel must review each policy. The bundled research is a starting point, and its low-confidence states need the most work.
- **No template is approved.** Counsel's documents must be uploaded and approved per state. The starter scaffolds are not legal text.
- **Data access needs a provider key.** Research coverage is 0 until ATTOM, Realie, RentCast or Regrid is configured, or sourcing markets are added.
- **Word-to-PDF needs Gotenberg** at `PDF_CONVERTER_URL`.
- **State holidays and split-state time zones** are approximations (s5).
