# CrewAI evaluation

Date: 2026-10-22. Question from the directive: keep the TypeScript worker and BullMQ, and use CrewAI as a supplement only where it clearly helps.

**Decision: no agent moves to CrewAI now.** All seven agents stay in the TypeScript worker. The CrewAI runtime (`apps/agents`) stays as it is: built, governed and unused. This document says why, and what would change the answer.

## What exists

- **TypeScript worker** (`apps/worker/src/agents`): seven agents.
  - One BullMQ queue.
  - One `AutomationRun` per job, opened before any work.
  - Rules before models.
  - Strict JSON output validated by schema.
  - Gated actions applied by the api only after a person approves.
  - A golden set of 116 cases replayed in CI.
  - A prompt lock.
  - Replays kept with every run.
- **CrewAI runtime** (`apps/agents`):
  - `HaloGovernedLLM` routes every completion through the api's cost-controlled internal route;
  - one `deal_review` crew;
  - no trigger, no tools, no eval;
  - CI runs only its HTTP client tests.
  - It has not been run in this environment for this evaluation.

## Criteria

An agent moves to CrewAI only if all four hold:

1. **It needs several agents to reason together.** One model call with a schema is not enough, and the work cannot be split into deterministic steps around one call.
2. **The extra steps measurably improve decisions.** That is shown on the golden set: the same cases, the agreement rate compared, with cost per case.
3. **It keeps the frame:**
   - an `AgentDecision` with the same action types;
   - gated actions applied only by the api;
   - no provider keys in the runtime;
   - every call through the internal route;
   - one run per job;
   - a replay kept.
4. **The second runtime is worth its cost:** a Python service, its deployment and monitoring, a cross-process hop, and the golden set run against both.

## Role by role

| Role | Today | Would CrewAI help? |
|---|---|---|
| Acquisition (Lead Analyst) | one mid-tier call after rules | No: a single classification with a rationale. |
| Underwriting (Deal Underwriter) | one strong call. The money comes from deterministic underwriting. | No: the model gives judgement (ARV, repairs) and the formula gives the rest. A second agent would duplicate the formula. |
| Seller Relations, Negotiation (Outreach Drafter) | one call per reply, every draft gated | Not now. A negotiating pair (one agent drafting, one critiquing against the deal's numbers) is the most plausible future use. A person sets every price today, so the gain would be draft quality only, and the eval would have to show it. |
| Disposition (Matcher, Buyer Responder) | deterministic scoring, then one call | No: the ranking is deterministic, and the model shortlists and writes. |
| Market Intelligence | one call explaining a fixed ranking | No: it explains; it does not research. |
| Market Expansion | one strong call over research given to it | **The best candidate, later.** Fresh legal research is a loop (search, read the statute, check effective dates, compare with the draft), and a second agent challenging each claim fits CrewAI's model. It needs tools the platform does not have yet: web search and statute retrieval through the governed route. It also needs a way to measure research quality, which the golden set does not do today. |
| Property Intelligence, Contract, Buyer Intelligence, Transaction Coordinator, Compliance | deterministic services | No: these must give the same answer every time. Compliance in particular is never delegated to a model. |

## What would change the answer

- **A search-capable model route.** Built 2026-10-24 as `POST /internal/ai/web-research` (docs/agent-design.md s3.7), cost-controlled like any other call: Market Expansion now researches, rather than only reads. A CrewAI researcher-and-reviewer crew could then be compared, on a research golden set, with a single TypeScript agent given the same tool.
- **A measured gap in negotiation drafts.** Reviewed runs (the replays) would show people rewriting the Outreach Drafter's negotiation replies more often than the rest.

Until then, a second runtime adds operational weight with no measured gain.

## If it is adopted later

- Wire a single crew behind `POST /internal/agents/run`, which is reserved for this. It returns the same `AgentDecision`. The worker opens the run, calls the crew and records the decision, so gating, approval, replay and eval are unchanged.
- Add the crew's agent to the golden set and run both implementations on the same cases before switching.
