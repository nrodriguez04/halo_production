# Agent design proposal

Status: **proposal — needs the five decisions in §9 before implementation.**

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
- **Produces:** ARV, repair estimate, MAO, confidence, rationale, and a recommended offer range. Writes `underwriting_results`; writes deal economics **only** if the deal has not been edited since the run started (the guard from #85).
- **Autonomy:** full, for numbers. Never contacts anyone.
- **Model tier:** strong (numeric reasoning over documents).

### 3.3 Outreach Drafter
- **Trigger:** a Lead Analyst `qualified` recommendation is approved; an inbound reply arrives (`INBOUND_WEBHOOK`); a deal has had no outbound activity for N days (nightly sweep).
- **Reads:** deal context (`GET /agent/deals/:id/context`), the thread, compliance facts, quiet-hours window.
- **Produces:** a draft reply or follow-up in the approval queue, classified intent for inbound (`interested`, `not_interested`, `callback`, `wrong_number`, `opt_out` — the last two are handled deterministically before the model is asked).
- **Autonomy:** none outward. It may schedule itself (a follow-up `AutomationRun` with a future `runAt`) and may move a deal `contacted → negotiating` when the inbound classification is `interested` **and** a person approves the reply.
- **Model tier:** mid, with the strong tier for negotiation replies above a configurable deal value.

### 3.4 Disposition Matcher
- **Trigger:** deal enters `under_contract`.
- **Reads:** deal economics, buyer list (buy-box criteria, past behaviour), marketing history.
- **Produces:** a ranked buyer shortlist with reasons and a buyer-blast draft (existing `marketing` queue) for approval.
- **Autonomy:** ranking only. The blast is approved by a person; sends go through the same boundary.
- **Model tier:** mid.

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
- **Golden set**: 30 leads and 10 deals with known-good decisions, re-run on every prompt change in CI (`npm run agents:eval`), failing the build if the decision agreement rate drops below a threshold. The set is seeded from the first 50 human approvals/rejections.
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
3. [next] Deal Underwriter moved onto the agent frame (deal stage triggers).
4. Outreach Drafter: inbound classification deterministic-first, drafts to the queue.
5. Disposition Matcher.
6. Autonomy `standard` for tenants that opt in after reviewing their runs.

Each step is its own PR with its agent's eval in CI.

## 11. Implementation notes (steps 1-2)

- **Contract**: `packages/shared/src/agents/agents.ts` (`AgentJobPayload`, `agentJobId`, `AgentDecision`, `AgentAction`, model tiers, the Lead Analyst output schema). Prompt: `prompts.json` -> `lead_analyst`, version `lead_analyst.v1`.
- **Queue**: BullMQ `agents`, one queue for every agent, dispatched on `payload.agent`. Job id = `agent__entityType__entityId__triggerEventId` (BullMQ forbids `:` in custom ids), so a replayed trigger never runs the same agent twice for the same event.
- **Triggers**: the worker queues `lead_analyst` when enrichment finalizes a lead as `enriched` (`apps/worker/src/processors/lead-enrichment.processor.ts`); `AgentSweepService` (api) re-queues leads that sat in `enriched` with no deal for `AGENT_SWEEP_STALE_DAYS` (default 7); `POST /agent/runs` queues one by hand (the Agents page).
- **Worker**: `apps/worker/src/agents/` (`agents.processor.ts`, `lead-analyst.agent.ts`, `agent-context.ts`). The context is non-contact data only (phone/email appear as present/absent flags, sealed payloads stay sealed). The processor opens the run through `POST /api/internal/agent/runs` before any work and reports through `POST /api/internal/agent/runs/:id/decision`. It never writes domain tables.
- **Rules before models**: DNC, no usable address, out-of-scope property type, owner-occupied without a distress signal. A rule answer costs nothing.
- **Api**: `AgentOrchestrationService` applies the decision within the tenant's autonomy (`ControlPlane.agentAutonomy`). Score and note always apply; an ungated transition (rule disqualify) applies only under `standard`; gated actions (qualify, first-touch drafts) wait for `POST /agent/runs/:id/approve`, which moves the lead as the approving user and creates Message drafts (recipient revealed api-side; drafts still go through the communications approval queue before anything sends). `POST /agent/runs/:id/reject` closes the run without touching the lead.
- **Budget**: workflow buckets `agent:<name>` (monthly; see `seed-providers.ts`) via the `workflow` hint on the internal chat route. A blocked run is recorded CANCELLED with a `blocked` decision, not FAILED.
- **Models**: `ControlPlane.agentModels` overrides per tier; `claude-*` routes to the Anthropic adapter, everything else to OpenAI.
- **UI**: `/admin/agents` (approval queue with the drafts in full, recent runs, autonomy + model tiers, queue a run).
- **Not yet**: the golden-set eval in CI, Underwriter / Drafter / Matcher on the frame, the inbound trigger (lands with the Drafter), CrewAI runtime.
