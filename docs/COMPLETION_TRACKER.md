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
| 1 | All 51 jurisdictions in the framework, with research and uncertainties | done | research drafts only | a decision on each policy: counsel's approval or the owner's risk acceptance (21 acceptable on current research) |
| 1 | Owner risk acceptance as a second approval basis for policies and templates, labelled "Owner-accepted, not counsel-approved" everywhere (decided 2026-10-23) | done (unit and real-Postgres tests; docs/markets.md s3.1) | nothing accepted yet | the owner's decision per state |
| 1 | Classifications A–E, activation statuses, structures, channels, disclosures, deadlines, requirements, sources, counsel review, versions | done | done | — |
| 1 | Licence/registration tracking, authorized operators, broker-partner agreements | done | done | the licences themselves |
| 2 | Market Activation Matrix dashboard | done | done | — |
| 2 | Three coverage KPIs (research, technical, active) | done | done | data provider key for research coverage |
| 2 | A documented path to activation per state | done (research activation steps, ladder checks, next step) | done | — |
| 3 | Market intelligence engine (metro, county and ZIP ranking; metros from the Census 2023 CBSA delineation) | done | with imported or pulled sales (ATTOM area pull live-verified 2026-10-23) | property data for coverage |
| 3 | Recommend markets to activate next | done | done | — |
| 3 | Conversion funnel: leads, reachable owners, contacts, conversations, offers, contracts, assignments, closings, realized fees and cost (provider charges plus entered spend: mail, ads, lists), by source and state (decided 2026-10-23; spend 2026-10-24) | done (unit and real-Postgres tests; docs/data-pipeline.md s5.1) | with leads in the database | — |
| 4 | Lifecycle: discover → enrich → underwrite | done | with a provider key | data provider keys |
| 4 | Lifecycle: negotiate → contract → verify → market → offers → assign → close → fee | done | in approved markets only | counsel, DocuSign, title company |
| 4 | Texas end-to-end lifecycle test | done (synthetic, real Postgres) | not until TX is approved or accepted | the TX policy and templates, approved by counsel or accepted by the owner |
| 5 | DOCX templates, merge fields, required-field validation, versioning, state selection | done | done | real agreement templates per state, approved by counsel or accepted by the owner |
| 5 | PDF generation | done: .txt through pdf-lib; .docx through Gotenberg, verified against a local `gotenberg/gotenberg:8` (the compose image) and run in CI's integration job | wherever Gotenberg runs (in `docker-compose.prod.yml`) | — |
| 5 | Deadline and cancellation calculations | done | done | — |
| 5 | Executed-document verification with automated checks (DocuSign signers recorded at completion); explicit legal sufficiency and disclosure confirmations | done | done | DocuSign account |
| 6 | Provider-neutral property and recorded-sales ingestion | done (county CSV tested; ATTOM area snapshot and property lookups live-verified 2026-10-23; ATTOM sales history and Regrid not run live) | county CSV and ATTOM: yes | Regrid token; county data licences; the env `ATTOM_API_KEY` is rejected, the Integrations-page key works |
| 6 | Investor discovery, entity matching, cash-purchase signals, inferred buy box | done | done | — |
| 6 | Inbound SMS response matching to buyers | done (a number held on exactly one buyer; Buyer Responder drafts the reply) | when Twilio is configured | Twilio number and A2P registration |
| 7 | Do Not Call registry scrubbing for marketing texts: imports of national and state lists, 31-day coverage by area code, send-time checks, written-consent exemption, a requirement that starts on | done (unit and real-Postgres tests; docs/communications.md s7) | no registry data imported | a registry subscription for the account's area codes; counsel on whether scrubbing and which exemptions apply |
| 7 | Email infrastructure: readiness, message classes and switches, internal test sends, inbound, unsubscribe, suppression list, delivery events, deliverability, seller consent, audit | done (internal test send verified against a local SMTP catcher; signed event webhooks verified over HTTP with local keys) | internal test sends only; external sending stays off by instruction | user authorization to send; SendGrid or Resend account, domain authentication and the event webhook key |
| 8 | Market Intelligence agent (explains the deterministic ranking; records a brief, changes nothing) | done (golden set 7 cases with hand-written replies; end to end against the scratch api with recorded replies) | needs AI on and a model key | — (live 2026-10-24: 100% agreement after the eval fix; docs/agent-eval.md) |
| 8 | Market Expansion agent (proposes sourced answers, counsel questions, requirements, steps for one state; a person accepts into the draft; never submits, approves or activates) | done (golden set 16 cases; accepted proposals verified in the scratch database) | needs AI on and a model key | LLM key; web research needs a search-capable model route (not built); live 2026-10-24: 78% agreement after the label fix, one gated over-proposal open (docs/agent-eval.md) |
| 8 | The twelve roles mapped to agents or deterministic services (Compliance, Transaction Coordinator, Contract, Property and Buyer Intelligence are services by design) | done (docs/agent-design.md s12) | as each agent or service | — |
| 8 | CrewAI evaluation | done (docs/crewai-evaluation.md: no agent moves now) | — | — |
| 9 | Security, regression, deployment validation | done: approval permissions and upload typing fixed; every suite green; the compose config resolves; four existing deploy defects fixed (images did not build; `.dockerignore` let `.env.local` into images; the web image lacked its build-time Descope and API values); api, worker and web images build and start; CI builds them and runs integration with Gotenberg (docs/OPERATIONAL_READINESS.md s5) | deployed 2026-10-24: DigitalOcean, https://app.haloacquisitions.com, Let's Encrypt certificates, all 11 smoke checks passing | — |
| 9 | Dependency security: Next 15.5 and React 19, nodemailer 10, maplibre 6, multer 2.5 and patch overrides, Node 22 images; production advisories 52 -> 14, none critical, none reachable at runtime | done (docs/DEPENDENCY_SECURITY.md; the map's tiles seen drawing in a browser 2026-10-23) | deployed 2026-10-24: DigitalOcean, https://app.haloacquisitions.com, Let's Encrypt certificates, all 11 smoke checks passing | — |
| 9 | Final engineering and operational readiness report | done (docs/OPERATIONAL_READINESS.md) | — | — |

## Milestones

| Date | Milestone | Commit |
|---|---|---|
| 2026-10-22 | Markets: 51 jurisdictions, research, versions, ladder, authorizations, gates, self-test; templates: .docx/.txt, approval, generation, PDFs; verification checks | see git log |
| 2026-10-22 | Data pipeline: property facts in enrichment, recorded sales (county CSV, ATTOM, Regrid), investor discovery, market intelligence and recommendations; DocuSign signer validation; one Prisma client | see git log |
| 2026-10-22 | Communications: message classes, marketing switches, market channel gates at send time, internal test sends, SendGrid/Resend delivery events, suppression list, deliverability, seller consent, buyer SMS matching | see git log |
| 2026-10-22 | Security: approvals need deals:approve; automation-run writes are operator-only; uploads typed by their bytes | see git log |
| 2026-10-22 | Agents: Market Intelligence and Market Expansion, golden sets, role mapping, CrewAI evaluation | see git log |
