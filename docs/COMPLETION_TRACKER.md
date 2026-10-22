# Completion tracker: nationwide wholesaling engine

Directive dated 2026-10-22; engineering deadline 2026-10-29. This file tracks every item in it, with three columns kept apart:
- **Built:** the engineering is done and tested;
- **Operational:** it works in production today;
- **External dependency:** what outside party, credential or approval it waits on.

A feature can be built and still not operational. Nothing here is marked done on the strength of a plan.

Status values: `done`, `in progress`, `not started`, `blocked (external)`.

## Audit (2026-10-22)

Already working before this directive (PR nrodriguez04/halo_production#121):
- the contract-flipping lifecycle from a signed contract to a recorded fee;
- deterministic underwriting, buyer ranking and fee pricing;
- campaigns, buyer deal pages, offers, assignments, closing files and revenue recognition;
- the disposition gate;
- the TypeScript agent worker (Lead Analyst, Deal Underwriter, Outreach Drafter, Disposition Matcher, Buyer Responder) with a golden eval.

Gaps the audit found and where they stand:

| Gap | Status |
|---|---|
| One-row-per-state policy; no versions, licences, channels or deadlines | done: markets (docs/markets.md) |
| Only `.txt` templates, tag-based review, no PDF | done: versioned .docx/.txt templates, counsel approval per state, PDFs |
| Enrichment never creates `Property` rows, so lead-born deals cannot be underwritten | done: ATTOM facts written to the lead's property (docs/data-pipeline.md s2) |
| No comps or recorded-sales tables; no public-records buyer discovery; no Regrid | done: recorded sales, discovery, Regrid client (live provider runs pending keys) |
| No seller consent capture; no email bounce/complaint webhooks; no suppression list; no transactional/marketing split; no email readiness endpoint | done (docs/communications.md) |
| Agent approve/reject routes have no permission check | done: `deals:approve` on agent runs, message approval (it releases the send) and automation-run approval |
| Found while fixing that: `POST /automation/runs*` let any signed-in user write a run with a decision an approver could then accept as an agent's | done: operators only (`control_plane:write`); the worker uses `/internal` |
| Document upload checks the extension only, not the MIME type | done: the type comes from the extension and the file's first bytes must match it; the client's claimed type is never stored (documents, inbound email attachments, `/storage/upload`) |
| CrewAI scaffold unused | evaluated: not adopted now; criteria and the one likely future use in docs/crewai-evaluation.md |
| Found while testing: every module made its own Prisma client and pool (41 pools); integration runs hit Postgres's connection limit | done: one global Prisma client |
| Found while testing: `GET /buyers/:id` shadowed new `/buyers/*` routes | done: candidates live at `/buyer-candidates` |

## Scope

| # | Item | Built | Operational | External dependency |
|---|---|---|---|---|
| 1 | All 51 jurisdictions in the framework, with research and uncertainties | done | research drafts only | counsel review of each policy |
| 1 | Classifications A–E, activation statuses, structures, channels, disclosures, deadlines, requirements, sources, counsel review, versions | done | done | — |
| 1 | Licence/registration tracking, authorized operators, broker-partner agreements | done | done | the licences themselves |
| 2 | Market Activation Matrix dashboard | done | done | — |
| 2 | Three coverage KPIs (research, technical, active) | done | done | data provider key for research coverage |
| 2 | A documented path to activation per state | done (research activation steps, ladder checks, next step) | done | — |
| 3 | Market intelligence engine (county/ZIP ranking; metro not yet) | done | with imported or pulled sales | property data for coverage; CBSA crosswalk for metros |
| 3 | Recommend markets to activate next | done | done | — |
| 4 | Lifecycle: discover → enrich → underwrite | done | with a provider key | data provider keys |
| 4 | Lifecycle: negotiate → contract → verify → market → offers → assign → close → fee | done | in approved markets only | counsel, DocuSign, title company |
| 4 | Texas end-to-end lifecycle test | done (synthetic, real Postgres) | not until counsel approves TX | counsel approval of the TX policy and templates |
| 5 | DOCX templates, merge fields, required-field validation, versioning, state selection | done | done | counsel's templates |
| 5 | PDF generation | done for .txt; .docx via Gotenberg | needs `PDF_CONVERTER_URL` | Gotenberg service in deployment |
| 5 | Deadline and cancellation calculations | done | done | — |
| 5 | Executed-document verification with automated checks (DocuSign signers recorded at completion); explicit legal sufficiency and disclosure confirmations | done | done | DocuSign account |
| 6 | Provider-neutral property and recorded-sales ingestion | done (county CSV tested; ATTOM and Regrid built, not run live) | county CSV: yes | ATTOM / Regrid keys; county data licences |
| 6 | Investor discovery, entity matching, cash-purchase signals, inferred buy box | done | done | — |
| 6 | Inbound SMS response matching to buyers | done (a number held on exactly one buyer; Buyer Responder drafts the reply) | when Twilio is configured | Twilio number and A2P registration |
| 7 | Email infrastructure: readiness, message classes and switches, internal test sends, inbound, unsubscribe, suppression list, delivery events, deliverability, seller consent, audit | done (internal test send verified against a local SMTP catcher; signed event webhooks verified over HTTP with local keys) | internal test sends only; external sending stays off by instruction | user authorization to send; SendGrid or Resend account, domain authentication and the event webhook key |
| 8 | Market Intelligence agent (explains the deterministic ranking; records a brief, changes nothing) | done (golden set 7 cases with hand-written replies; end to end against the scratch api with recorded replies) | needs AI on and a model key | LLM key; live eval agreement not yet measured |
| 8 | Market Expansion agent (proposes sourced answers, counsel questions, requirements, steps for one state; a person accepts into the draft; never submits, approves or activates) | done (golden set 16 cases; accepted proposals verified in the scratch database) | needs AI on and a model key | LLM key; web research needs a search-capable model route (not built); live eval agreement not yet measured |
| 8 | The twelve roles mapped to agents or deterministic services (Compliance, Transaction Coordinator, Contract, Property and Buyer Intelligence are services by design) | done (docs/agent-design.md s12) | as each agent or service | — |
| 8 | CrewAI evaluation | done (docs/crewai-evaluation.md: no agent moves now) | — | — |
| 9 | Security, regression, deployment validation | not started | | |

## Milestones

| Date | Milestone | Commit |
|---|---|---|
| 2026-10-22 | Markets: 51 jurisdictions, research, versions, ladder, authorizations, gates, self-test; templates: .docx/.txt, approval, generation, PDFs; verification checks | see git log |
| 2026-10-22 | Data pipeline: property facts in enrichment, recorded sales (county CSV, ATTOM, Regrid), investor discovery, market intelligence and recommendations; DocuSign signer validation; one Prisma client | see git log |
| 2026-10-22 | Communications: message classes, marketing switches, market channel gates at send time, internal test sends, SendGrid/Resend delivery events, suppression list, deliverability, seller consent, buyer SMS matching | see git log |
| 2026-10-22 | Security: approvals need deals:approve; automation-run writes are operator-only; uploads typed by their bytes | see git log |
| 2026-10-22 | Agents: Market Intelligence and Market Expansion, golden sets, role mapping, CrewAI evaluation | see git log |
