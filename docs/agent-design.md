# Agent design proposal

Status: **adopted.** The decisions in §9 were taken on 2026-10-12. Seven agents are built (§3, §10), and the twelve roles are mapped in §12.

This document proposes how AI agents operate inside Halo: which agents exist,
what triggers them, what they may do on their own, what they must hand to a
person, and where they run. It is written against the code as of `main` on
2026-10-11 and reuses what is already there rather than inventing a parallel
system.

## 1. What already exists

Three layers, in increasing ambition, all shipped:

| layer | what it is | state |
|---|---|---|
| **Agent API** (`/agent/*`) | 12 routes: deal summary and context, draft seller/buyer SMS and email, next-actions, classify-inbound, propose-follow-up, log-note | Template-based (no model call). Every draft lands in the approval queue with compliance facts attached, tied to an `AutomationRun`. |
| **Worker AI processors** | `underwriting` and `marketing` (buyer-blast copy) call a model through `POST /internal/ai/chat-completion` | The only place a model runs today. Budget-capped, kill-switched (`aiEnabled`), ledgered, idempotent. |
| **CrewAI runtime** (`apps/agents`) | `HaloGovernedLLM` routes every completion through the same internal route; one `deal_review` crew | No trigger, no tools, one agent. Runs by hand from a saved JSON. |

Supporting pieces the agents will stand on:

- **Lifecycle state machines** (`@halo/shared`): leads `new → enriching → enriched → contacted → qualified` (or `disqualified`); deals `new → contacted → negotiating → under_contract → marketing → assigned → closed` (or `lost`). Transitions are validated and write timeline events.
- **`AutomationRun`**: a run ledger with `QUEUED/RUNNING/AWAITING_APPROVAL/…` status, `triggerType` (`MANUAL`, `SCHEDULED`, `INBOUND_WEBHOOK`, `UI`, `API`), input/output/decision JSON, `approvalRequired`, approver, `modelProvider`/`modelName`/`promptVersion`, and estimated/realized value. This is the agent's audit trail; nothing new is needed to record what an agent did and why.
- **Timeline** events per entity (`AGENT_DRAFT_CREATED`, `AGENT_CLASSIFIED_INBOUND`, `UNDERWRITE_COMPLETED`, `MESSAGE_APPROVED`, …) — the memory an agent reads before acting.
- **Cost governance**: per-provider/per-model pricing, daily and monthly buckets per tenant, `BLOCK_OVER_BUDGET`, manual overrides, a kill switch per tenant and a GLOBAL one.
- **The send boundary**: the only way a message reaches a provider is `POST /internal/messages/:id/send`, which sends an *approved* message by id and re-checks compliance at that moment. An agent cannot send; it can only create a draft that a person approves.

## 2. Principles

1. **Agents draft; people approve anything outward-facing.** Already enforced by the send boundary. This proposal does not widen it.
2. **Every agent action is an `AutomationRun`.** Input, model, prompt version, output and decision are recorded before the action takes effect. No agent writes to a domain table except through an existing service that validates the transition.
3. **Agents hold no keys.** All model calls go through `/internal/ai/chat-completion`; all data access goes through the api. The worker and the Python runtime already obey this.
4. **Budgets before intelligence.** A run that would exceed the tenant's AI budget is blocked by cost control before the model is called, and the run is recorded as blocked, not failed.
5. **Deterministic first.** If a rule (score threshold, state check, DNC) answers the question, the model is not asked.

## 3. The agent roster (first release)

Four agents, each a job on an existing queue, each one `AutomationRun` per invocation.

### 3.1 Lead Analyst
- **Trigger:** lead enters `enriched` (lifecycle transition), and nightly for leads that have been `enriched` more than 7 days with no deal.
- **Reads:** lead, property, source records (ATTOM/geocode), skip-trace result flags, prior timeline.
- **Produces:** a `score` (0–100) with a one-paragraph rationale and a recommended next state: `qualified`, `disqualified`, or `hold`. For `qualified`, a draft first-touch SMS and email via the existing `/agent/deals/:id/draft-*` path semantics (so they land in the approval queue).
- **Autonomy:** may set `score` and append a timeline note on its own. May transition `enriched → disqualified` on its own **only** when a hard rule fires (owner-occupied with no equity signal, property type out of scope, DNC hit). Every `qualified` recommendation is a draft for a person.
- **Model tier:** mid (classification + short rationale).

### 3.2 Deal Underwriter
- **Trigger:** deal enters `contacted` or `negotiating`; also on demand (existing `POST /underwriting/analyze/:dealId`).
- **Reads:** deal, property, comps (RentCast/ATTOM), prior underwriting results, manual edits (respecting the stale-write guard already in the processor).
- **Produces:** ARV, repair estimate, MAO, confidence, rationale, and a recommended offer range. MAO = ARV x 0.70 - repairs - the assignment fee (the deal's own, else the tenant's default on the Agents page, $10,000 out of the box). Writes `underwriting_results`; writes deal economics **only** if the deal has not been edited since the run started (the guard from #85).
- **Autonomy:** full, for numbers. Never contacts anyone.
- **Model tier:** strong (numeric reasoning over documents).

### 3.3 Outreach Drafter
- **Trigger:** a Lead Analyst `qualified` recommendation is approved; an inbound reply arrives (`INBOUND_WEBHOOK`); a deal has had no outbound activity for N days (nightly sweep).
- **Reads:** deal context (`GET /agent/deals/:id/context`), the thread, compliance facts, quiet-hours window.
- **Produces:** a draft reply or follow-up in the approval queue, classified intent for inbound (`interested`, `not_interested`, `callback`, `wrong_number`, `opt_out` — the last two are handled deterministically before the model is asked).
- **Autonomy:** none outward. It may schedule itself (a follow-up `AutomationRun` with a future `runAt`) and may move a deal `contacted → negotiating` when the inbound classification is `interested` **and** a person approves the reply.
- **Model tier:** mid, with the strong tier for negotiation replies above a configurable deal value.

### 3.4 Disposition Matcher
- **Trigger:** deal enters `marketing`, which happens when the seller's signature completes the contract (DocuSign completion), or by hand. It used to fire on `under_contract`, which is set when the contract is only sent.
- **Reads:** deal economics, buyer list (buy-box criteria, past behaviour), marketing history.
- **Produces:** a ranked buyer shortlist with reasons and a buyer-blast draft (existing `marketing` queue) for approval.
- **Price:** buyers are asked the **buyer price**: a price a person set on the deal, else the contract price, the offer made to the seller or the MAO plus the assignment fee, else 70% of ARV less repairs (`buyerAskingPrice` in `packages/shared/src/utils/buyer-price.ts`). The seller-side figures never reach a buyer: advertising them would give the fee away.
- **Autonomy:** ranking only. The blast is approved by a person; sends go through the same boundary.
- **Model tier:** mid.

### 3.5 Buyer Responder
- **Trigger:** a cash buyer replies by email to a deal we emailed them about (the inbound webhook ties the reply to the deal of the email it answers, by subject, else to the deal we last emailed them about). Out-of-office replies are recorded but never answered.
- **Reads:** the deal as a buyer sees it (the buyer price, ARV, repairs, the property), the buyer's buy box, this buyer's thread on this deal, opt-out status. The seller side (offer, contract price, MAO) is loaded so the price can be worked out but is never shown to the model.
- **Produces:** the reply's intent (`interested`, `question`, `offer`, `not_interested`, `opt_out`, `unclear`), any offer the buyer named (in the note and the run summary), and a reply draft to the buyer for approval. Opt-out and wrong-person phrases, opted-out buyers and deals that are already assigned, closed or lost are rules; a deal that is gone gets a courtesy reply from a template.
- **Autonomy:** none outward. It never accepts, rejects or counters an offer and never moves a deal: a person negotiates and sends the assignment. Opt-outs are recorded at once (rule or confident model), like the Outreach Drafter.
- **Model tier:** mid.

### 3.6 Market Intelligence
- **Trigger:** by hand, from the Market Intelligence page (nationwide, or one state) or the Agents page. No sweep: a brief costs a model call and the data changes slowly.
- **Reads:** Halo's own ranking, already computed (docs/data-pipeline.md s5). Nationwide, that is the states with a scored opportunity, each with its priority, opportunity, feasibility, status, class and best counties. For one state, it is its counties with every score component and its basis. It also reads the coverage counts and the three coverage KPIs. The api builds this (`MarketAgentContextService`); the worker never reads research or sales itself.
- **Produces:** a brief: a summary, at most five priorities (why each ranks where it does, its risks, what to verify) and the data gaps.
- **Autonomy:** the brief is recorded on the run (`record_market_brief`, autonomous), and nothing else changes. Priorities are bound to the ranked candidates and kept in Halo's order. A reply that calls a market legal, approved or cleared is refused. With no recorded sales, the rule `no_data` holds without a model call.
- **Model tier:** mid. Prompt `market_intelligence.v1`.

### 3.7 Market Expansion
- **Trigger:** by hand, from a market's Expansion agent tab or the Agents page.
- **Reads:**
  - the market: requested and effective status, draft status, class, approved version, next step, what is missing;
  - the draft: answers, requirements, disclosures, deadlines, open questions, steps, sources;
  - the questions the draft leaves unknown;
  - the bundled research: findings, sources normalized as an import would store them, pending bills, open questions;
  - the authorizations on file;
  - the state's best counties.
- **Produces:** a proposal for the draft:
  - sourced answers to unknown questions;
  - counsel questions;
  - requirements;
  - a class;
  - activation steps;
  - risks.
- **Autonomy:** none. `propose_market_draft` is gated: a person (`deals:approve`) accepts it into the editable draft, marked as unverified, and counsel still reviews and approves the policy. No action exists that submits, approves, activates or changes a status. The rules in docs/markets.md s11 run in code, before the proposal is shown and again when it is applied.
- **Holds without a model:** a market a person blocked or restricted; a draft in counsel review; an active market; no research; a draft with nothing unknown.
- **Model tier:** strong. Prompt `market_expansion.v1`.
- **Not yet: web research.** The agent works only from what it is given.

Not in the first release: anything that negotiates price autonomously, anything that signs or sends contracts, anything that calls.

## 4. Triggers

| kind | mechanism | used by |
|---|---|---|
| **Lifecycle event** | `LeadLifecycleService.transition` / `DealsService.updateStage` enqueue an `agents` job with `{agent, entityType, entityId, triggerType: 'API'|'UI'}` after the transition commits | Analyst, Underwriter, Matcher |
| **Inbound webhook** | Twilio inbound handler enqueues after attribution succeeds (never for unattributed or STOP/HELP, which are handled deterministically) | Drafter |
| **Scheduled sweep** | one nightly BullMQ repeatable job per tenant: stalled `enriched` leads, deals with no activity for N days | Analyst, Drafter |
| **Manual** | `POST /agent/runs` (new) with `{agent, entityId}` from the UI | all |

One new queue, `agents`, with one processor that dispatches on `agent`. Repeatable jobs are registered per tenant at startup and when a tenant is created. Concurrency per tenant is 1 so an agent never acts on an entity twice at once; idempotency key is `(agent, entityId, triggerEventId)`.

## 5. Autonomy boundary

Three tiers, enforced in code, not by prompt:

| tier | agent may | enforcement |
|---|---|---|
| **Autonomous** | compute and persist scores, underwriting numbers, buyer rankings; append timeline notes; schedule its own follow-up run; transition to `disqualified` on a hard rule | existing services validate every write |
| **Approval-gated** | create message drafts; recommend `qualified`; recommend offer range; recommend buyer blast | run is `AWAITING_APPROVAL`; the only effect is a queue entry |
| **Forbidden** | send anything; change deal stage past `negotiating`; touch contracts; alter budgets or control-plane switches; read unmasked PII outside the api | no code path exists; `/internal` routes do not expose these |

A tenant-level setting `agentAutonomy: 'draft_only' | 'standard'` gates the autonomous tier (default `draft_only` for a new tenant until an operator flips it after reviewing runs).

## 6. Runtime placement

**Recommendation: TypeScript worker first; CrewAI stays as the escape hatch.**

Everything an agent needs — queue, cost-governed model access, state machines, run ledger, timeline — lives in the TypeScript worker and api. A Python service adds a container, a second language and a cross-process hop for workflows that are, in the first release, single-agent request/response. CrewAI earns its place when a workflow genuinely needs several agents negotiating (for example a buyer-side and seller-side analyst debating an offer). `apps/agents` and `HaloGovernedLLM` are kept, documented as that path, and `/internal/agents/run` is reserved for when it is used.

Each agent is a class in `apps/worker/src/agents/<name>.agent.ts` implementing `run(ctx): Promise<AgentDecision>`, with the prompt in `packages/shared/src/agents/prompts/` (versioned; `promptVersion` is recorded on the run).

## 7. Models and providers

Model access is already abstracted behind `/internal/ai/chat-completion` with per-model pricing. The route is being extended to accept Anthropic models alongside OpenAI (`model` prefix routes to the provider); both are cost-governed identically.

| tier | purpose | candidates |
|---|---|---|
| **cheap** | inbound classification, extraction, dedupe hints | `gpt-4o-mini`, `claude-haiku-4-5` |
| **mid** | lead rationale, outreach drafts, buyer ranking | `gpt-4o`, `claude-sonnet-5-5` |
| **strong** | underwriting, negotiation replies above the value threshold | `claude-opus-5-5`, `gpt-4-turbo` |

Tier → model is a tenant setting with a platform default, so changing a model is configuration, not a deploy. Every run records `modelProvider` and `modelName`. Prompts are provider-neutral (system + user text, JSON output requested in the prompt and validated by schema on the way back).

## 8. Observability and evaluation

- **Runs page** (`/admin/automation` already lists runs): add agent name, model, cost, decision and approval outcome per run.
- **Per-agent budget buckets** (`scope: 'workflow'`, `scopeRef: '<agent>'`) so one runaway agent cannot consume the tenant's whole AI budget.
- **Golden set** ([agent-eval.md](agent-eval.md)): 93 synthetic cases across the five agents (31 leads, 12 deals for the Underwriter, 23 seller conversations, 12 buyer matches, 15 buyer replies) with the decision a person would accept. CI replays every case against its recorded model reply on every change (`npm run agents:eval`, free); with an eval key it also asks the real models when a prompt, an agent or the set changes and fails below each agent's decision agreement threshold. Safety checks (no outreach without approval, no price a person did not enter, no buyer without an email, MAO never above ARV, ...) apply to every decision. A prompt lock fails CI when a prompt changes without a new version. Every agent run keeps its context and the model's raw reply (`agent_run_replays`), so the set can grow from the pilot's approvals and rejections.
- **Decision drift**: weekly job compares agent recommendations with the human approval rate per agent and surfaces it on the runs page.

## 9. Decisions (taken 2026-10-12)

The recommended defaults were adopted:

1. **Runtime**: TypeScript worker. CrewAI (`apps/agents`) stays an escape hatch behind the same `AgentDecision` contract.
2. **Triggers**: lifecycle + inbound + nightly sweep (`AGENT_SWEEP_HOUR_UTC`, default 07:00 UTC, after the sourcing pulls).
3. **Autonomy default**: `draft_only` for every tenant; `standard` is a per-tenant switch on the Agents admin page.
4. **Model tiers**: the table in s7 is the intent. Until an Anthropic workspace key is configured the platform defaults are OpenAI (`gpt-4o-mini` / `gpt-4o` / `gpt-4o`); a tenant can override each tier.
5. **Release order**: Analyst -> Underwriter -> Drafter -> Matcher.

## 10. Rollout

1. [done] `agents` queue, processor, `AgentDecision` type, run recording, tenant autonomy setting, per-agent budget buckets.
2. [done] Lead Analyst on lifecycle + sweep triggers, `draft_only`. Golden set: to be seeded from the first approvals.
3. [done] Deal Underwriter on the agent frame (stage triggers `contacted` / `negotiating`, manual `POST /underwriting/analyze/:dealId`).
4. [done] Outreach Drafter: inbound SMS classified rule-first (opt-out phrases, wrong number) then by model; replies and nightly follow-ups drafted to the approval queue; `contacted -> negotiating` on approval of an interested reply.
5. [done] Disposition Matcher: buy-box scoring then a mid-tier shortlist; ranking recorded at once, the blast approved by a person as one email draft per buyer in the communications queue.
6. [done] The golden-set eval in CI ([agent-eval.md](agent-eval.md)).
7. [done] Buyer Responder: buyer replies to a blast are classified and answered as drafts for approval (s3.5).
8. [next] Autonomy `standard` for tenants that opt in after reviewing their runs.
9. [done 2026-10-22] Market Intelligence and Market Expansion (s3.6, s3.7), with golden sets (7 and 16 cases). The recorded replies are written by hand: the live agreement for these two prompts has not been measured. CI measures it when the eval key is configured.

## 12. The twelve roles

The directive names twelve agent roles. Halo fills each one with a model agent only where judgement over text is the job. Where the answer must be the same every time, a deterministic service fills it, because a gate that depends on a model's mood is not a gate (docs/contract-flipping.md s8).

| Role | Filled by | Model? |
|---|---|---|
| Acquisition | Lead Analyst (s3.1): scores leads, recommends qualify or disqualify, drafts the first touch | yes |
| Property Intelligence | enrichment and `PropertyFactsService` (ATTOM facts on the lead's property, with source and quality); the Lead Analyst and Underwriter read it | no |
| Underwriting | Deal Underwriter (s3.2) for ARV and repairs. The MAO and offer range come from the deterministic `underwriteDeal` | judgement only |
| Seller Relations | Outreach Drafter (s3.3): classifies replies, drafts answers and follow-ups for approval | yes |
| Negotiation | the Outreach Drafter (seller replies; the strong tier above the value threshold) and the Buyer Responder (captures buyer offers). A person sets every price and accepts every offer | drafts only |
| Contract | `TemplatesService` (state-selected, counsel-approved templates, required fields, PDFs) and the purchase-agreement checks | no |
| Buyer Intelligence | `InvestorDiscoveryService` (recorded purchases, entity matching, inferred buy box) and the Matcher's deterministic buy-box scoring | no |
| Disposition | Disposition Matcher (s3.4) and Buyer Responder (s3.5) | yes |
| Transaction Coordinator | the closing file, the deadline calculations, the disposition sweep and the eligibility gate | no |
| Compliance | the market gates, the disposition gate, the message classes and switches, consent, opt-outs and quiet hours | no, by design |
| Market Intelligence | Market Intelligence (s3.6) over the deterministic ranking | explains only |
| Market Expansion | Market Expansion (s3.7) | proposes only |

**Runtime.** Every agent runs in the TypeScript worker on BullMQ; the CrewAI decision is in docs/crewai-evaluation.md.

Each step is its own PR with its agent's eval in CI.

## 11. Implementation notes (steps 1-5)

- **Contract**: `packages/shared/src/agents/agents.ts` (`AgentJobPayload`, `agentJobId`, `AgentDecision`, `AgentAction`, model tiers, the Lead Analyst output schema). Prompt: `prompts.json` -> `lead_analyst`, version `lead_analyst.v1`.
- **Queue**: BullMQ `agents`, one queue for every agent, dispatched on `payload.agent`. Job id = `agent__entityType__entityId__triggerEventId` (BullMQ forbids `:` in custom ids), so a replayed trigger never runs the same agent twice for the same event.
- **Triggers**: the worker queues `lead_analyst` when enrichment finalizes a lead as `enriched` (`apps/worker/src/processors/lead-enrichment.processor.ts`); `AgentSweepService` (api) re-queues leads that sat in `enriched` with no deal for `AGENT_SWEEP_STALE_DAYS` (default 7); `POST /agent/runs` queues one by hand (the Agents page).
- **Worker**: `apps/worker/src/agents/` (`agents.processor.ts`, `lead-analyst.agent.ts`, `agent-context.ts`). The context is non-contact data only (phone/email appear as present/absent flags, sealed payloads stay sealed). The processor opens the run through `POST /api/internal/agent/runs` before any work and reports through `POST /api/internal/agent/runs/:id/decision`. It never writes domain tables.
- **Rules before models**: DNC, no usable address, out-of-scope property type, owner-occupied without a distress signal. A rule answer costs nothing.
- **Api**: `AgentOrchestrationService` applies the decision within the tenant's autonomy (`ControlPlane.agentAutonomy`). Score and note always apply; an ungated transition (rule disqualify) applies only under `standard`; gated actions (qualify, first-touch drafts) wait for `POST /agent/runs/:id/approve`, which moves the lead as the approving user and creates Message drafts (recipient revealed api-side; drafts still go through the communications approval queue before anything sends). `POST /agent/runs/:id/reject` closes the run without touching the lead.
- **Budget**: workflow buckets `agent:<name>` (monthly; see `seed-providers.ts`) via the `workflow` hint on the internal chat route. A blocked run is recorded CANCELLED with a `blocked` decision, not FAILED.
- **Models**: `ControlPlane.agentModels` overrides per tier; `claude-*` routes to the Anthropic adapter, everything else to OpenAI.
- **UI**: `/admin/agents` (approval queue with the drafts in full, recent runs, autonomy + model tiers, queue a run).
- **Deal Underwriter** (step 3): context = deal numbers + property + provenance summaries + the lead's non-contact facts + the prior result (`apps/worker/src/agents/deal-context.ts`); one strong-tier call (`deal_underwriter.v1`, strict JSON: ARV, repairs, MAO, offer range, confidence, offer/pass/hold). `set_deal_economics` is autonomous in both tiers (numbers never reach a seller): the api writes `arv`/`repairEstimate`/`mao` only if `deal.updatedAt` still equals the snapshot the worker loaded (a person's edit during the run wins) and always upserts `underwriting_results` with `evaluationMetadata.stale`, the offer range and the run id. Triggers: `DealsService.updateStage` into `contacted` or `negotiating` (job id carries the stage and timestamp), and `POST /underwriting/analyze/:dealId`, which now queues this agent instead of the legacy `underwriting` job. `GET /underwriting/result/:dealId` returns the newest of the agent row / legacy row / legacy job run, flattened for the deal page. The legacy `underwriting` queue and processor stay only because the chaos tooling references the queue; nothing enqueues them any more.
- **Outreach Drafter** (step 4): the Twilio inbound webhook links an ordinary reply to the lead that carries the number (blind index) and its open deal, records the message with `leadId`/`dealId`, then queues `outreach_drafter` with `trigger: inbound` and the message id (`apps/api/src/webhooks/twilio/twilio.service.ts`); STOP/HELP keywords never reach the agent. Context (`apps/worker/src/agents/outreach-context.ts`) = the last 20 messages (text only; numbers and addresses stay sealed), deal and lead facts, DNC and consent flags, follow-up counts. Rules first: opt-out phrases -> `record_opt_out` applied at once through the compliance service (DNC + revoked consents, number revealed api-side), wrong-number phrases -> `flag_contact` (lead tag `contact:wrong_number`), DNC -> hold, follow-up cap (`AGENT_FOLLOWUP_MAX`, 3) -> hold. Otherwise one mid-tier call (strong when negotiating and ARV >= `OUTREACH_STRONG_TIER_MIN_ARV`) classifies the reply (`classify_inbound`, recorded on the message metadata and the timeline) and drafts the answer; every draft is gated and lands in the communications approval queue on approval; an `interested` reply also carries a gated `transition_deal -> negotiating`, a decline a gated `transition_deal -> lost`; a model opt-out is autonomous only at confidence >= 0.7. The nightly sweep queues follow-ups for deals in contacted/negotiating whose last message is ours and older than `AGENT_FOLLOWUP_DAYS` (3) with nothing pending. Inbound replies are never de-duplicated: each gets its own run. Prices and terms are never proposed by the agent (prompt rule; a person-entered `offerAmount` may be repeated).
- **Disposition Matcher** (step 5): trigger `DealsService.updateStage -> marketing`, i.e. after the seller signs (plus manual). Context (`apps/worker/src/agents/disposition-context.ts`) = deal numbers, property, the Underwriter's result, every buyer's stated buy box, engagement score and past behaviour (messages to and from the buyer counted by blind index; contacts never opened in the worker), prior blasts for the deal. `scoreBuyers` ranks deterministically (city 40 / state 20, price range 30 or within 15% 15, engagement up to 20, past replies 10; no email = excluded, and a buyer whose stated locations name none of the deal's city, ZIP or state is excluded too; when nobody is left the deal holds by rule `no_buyer_in_area`); the top `AGENT_MATCHER_CANDIDATES` (15) go to one mid-tier call that shortlists at most `AGENT_MATCHER_SHORTLIST_MAX` (10) with reasons and writes the blast. `rank_buyers` is autonomous: a `buyer_shortlist` marketing material row plus `BUYERS_RANKED` on the deal timeline. `queue_buyer_blast` is gated: on approval the api creates one email per shortlisted buyer through `CommunicationsService.create` (buyer address revealed api-side and sealed on the row; DNC, consent and quiet hours checked per recipient), so each lands in the communications approval queue as `pending_approval` and sends through the normal boundary; a `buyer_blast` material row records subject, body, buyer ids, message ids and skips. The legacy worker buyer blast (one message with `buyerIds` and no recipient) cannot be dispatched and stays only behind the Marketing page button.
- **Inbound email** (2026-10-12): SendGrid Inbound Parse -> `POST /api/webhooks/email/inbound?token=...` (`apps/api/src/webhooks/email/`): the sender is matched to the lead by blind index, the reply recorded with the quoted thread stripped, attachments filed in the documents library, auto-replies and bounces recorded but never answered, buyer replies filed on the deal (`BUYER_REPLIED`, no draft yet), and the Drafter queued exactly like an inbound text. `EMAIL_REPLY_TO` puts the Inbound Parse subdomain on every outbound email. See `docs/integrations/email-inbound.md`.
- **Buyer price (2026-10-13)**: the Matcher used to score buyers against, and show its model, the offer made to the seller (then the MAO), so an approved blast could ask buyers for the contract price and leave no assignment fee; the legacy flyer, the legacy blast and `GET /buyers/match/:dealId` did the same. All of them now use the buyer price. The Matcher's model sees only `deal.askingPrice`, ARV and repairs (no offer, MAO or Underwriter offer range), its prompt is `disposition_matcher.v2`, and its decision summary names the price and how it was reached. The fee is `ControlPlane.defaultAssignmentFee` (Agents page) or the deal's `deal_economics.assignmentFee`; the deal page shows the buyer price and edits the asking price, contract price and fee. The Underwriter's MAO subtracts the same fee (`deal.assignmentFee` in its context, prompt `deal_underwriter.v2`).
- **Buyer Responder (2026-10-13)**: `apps/worker/src/agents/buyer-responder.agent.ts` and `buyer-context.ts`; prompt `buyer_responder.v1`; budget bucket `agent:buyer_responder`. The inbound email webhook queues it (`trigger: inbound`, the message id) for a buyer reply tied to a deal; replies are linked to the deal of the email they answer by subject before falling back to the latest one. A draft (`draft_message` with `recipientType: buyer` and the `buyerId`) is created on approval through `CommunicationsService.create` to the address the buyer wrote from (else the buyer's address on file), so DNC, consent, quiet hours and the Texas disclosure gate apply at send. Found while building it: the Outreach Drafter's seller thread was every message on the deal, buyer blasts and buyer replies included, so a seller-facing draft could see (and repeat) the buyer price and buyer emails counted as follow-ups to the seller; the seller thread is now the lead's messages plus deal messages to the seller's own number or address. Opt-out phrases now also catch "stop sending me deals" and "no more deals/offers".
- **Contract flipping (2026-10-21)** (docs/contract-flipping.md): the Buyer Responder now captures a price a buyer names as an agent-captured offer on the deal (`record_buyer_offer`, autonomous because it only records what the buyer wrote; an agent-captured offer cannot be accepted until a person confirms the amount). Approving a Disposition Matcher blast also checks the disposition gate and is refused while a buyer campaign is already running for the deal, so buyers are never reached twice for one contract. Approved seller drafts now go to the communications approval queue (`requestSend`); before, they stayed `draft` and nothing submitted them. The deterministic roles in the brief (contract verification, buyer ranking, pricing, transaction coordination, compliance) are services, not agents: see docs/contract-flipping.md s8.
- **Not yet**: self-scheduled follow-ups (the sweep covers them), the `standard` autonomy opt-in review, an export that turns reviewed runs into anonymized golden cases, CrewAI runtime (not adopted: docs/crewai-evaluation.md). Buyer replies by text now reach the Buyer Responder (docs/communications.md s6).
- **After the audit (2026-10-13)**: the Lead Analyst prompt is `lead_analyst.v2` (contacts are looked up after scoring, so a missing phone or email does not lower the score); skip trace runs right after the Analyst scores a lead at or above the cost-control threshold (60) and did not disqualify it (`AgentOrchestrationService.skipTraceAfterScore`), because the enrichment job's skip trace is score-gated and a new lead has no score yet; the first message that reaches a seller moves the deal `new -> contacted`; buyer-facing steps for Texas deals require the equitable-interest disclosure.
