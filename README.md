# Hālo - Internal AI Wholesaling Platform

A monorepo for the Hālo wholesaling platform with Next.js frontend, NestJS API, and BullMQ workers.

## Architecture

- **apps/web**: Next.js application (landing + app UI)
- **apps/api**: NestJS REST API
- **apps/worker**: NestJS/BullMQ workers (event-driven)
- **packages/shared**: Shared types, schemas, prompt templates, utilities

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm (workspaces) or pnpm/yarn (if you update `packageManager`)

## Quick Start

1. **Create env files** (not committed to repo):

   - `apps/api/.env.local`
   - `apps/web/.env.local`
   - `apps/worker/.env.local`

   Minimal local dev template:

   ```bash
   # apps/api/.env.local + apps/worker/.env.local
   DATABASE_URL="postgresql://halo:halo_dev_password@localhost:5432/halo_dev?schema=public"
   REDIS_URL="redis://localhost:6379"
   OPENAI_DAILY_COST_CAP=2.0

   # Optional integrations
   OPENAI_API_KEY=""
   ATTOM_API_KEY=""
   ATTOM_BASE_URL="https://api.gateway.attomdata.com"
   GOOGLE_GEOCODING_API_KEY=""
   TWILIO_ACCOUNT_SID=""
   TWILIO_AUTH_TOKEN=""
   TWILIO_PHONE_NUMBER=""
   DOCUSIGN_CLIENT_ID=""
   DOCUSIGN_CLIENT_SECRET=""
   DOCUSIGN_ACCOUNT_ID=""
   DOCUSIGN_BASE_URL="https://demo.docusign.net"

   # apps/web/.env.local
   NEXT_PUBLIC_DESCOPE_PROJECT_ID="P38G1PBUXN1j1v4xvgq8WLdYDVhg"
   NEXT_PUBLIC_DESCOPE_FLOW_ID="sign-up-or-in"
   NEXT_PUBLIC_API_URL="http://localhost:3001/api"

   # apps/api/.env.local (add auth)
   DESCOPE_PROJECT_ID="P38G1PBUXN1j1v4xvgq8WLdYDVhg"
   DESCOPE_MANAGEMENT_KEY=""
   ```

2. **Start infrastructure:**
   ```bash
   docker compose up -d
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Setup database:**
   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. **Start development servers:**
   ```bash
   npm run dev
   ```

This will start:
- Web app: http://localhost:3000
- API: http://localhost:3001
- Worker: running in background

## Infrastructure Services

- **Postgres** (with pgvector): localhost:5432
- **Redis**: localhost:6379
- **MinIO**: http://localhost:9000 (Console: http://localhost:9001)
- **MailHog**: http://localhost:8025
- **OpenSearch** (optional): http://localhost:9200

## Development

### Running individual apps

```bash
# Web app only
cd apps/web && npm run dev

# API only
cd apps/api && npm run dev

# Worker only
cd apps/worker && npm run dev
```

### Database Commands

```bash
npm run db:generate  # Generate Prisma client
npm run db:migrate   # Run migrations
npm run db:seed      # Seed initial data
npm run db:studio    # Open Prisma Studio
```

### Testing

```bash
npm run test         # Run all tests
npm run lint         # Lint all packages
npm run typecheck    # Type check all packages
```

## Project Structure

```
.
├── apps/
│   ├── web/                    # Next.js frontend
│   │   ├── app/
│   │   │   ├── (marketing)/    # Landing pages
│   │   │   ├── (app)/          # Application pages (routes like /dashboard, /leads, ...)
│   │   │   └── (auth)/         # Descope sign-in routes
│   │   ├── app/providers.tsx   # DescopeProvider
│   │   ├── lib/api-fetch.ts    # API helper with Descope bearer token
│   │   └── middleware.ts        # Descope route protection
│   ├── api/                     # NestJS API
│   │   ├── src/
│   │   │   ├── auth/           # Auth guards & decorators
│   │   │   ├── analytics/      # KPIs + trends
│   │   │   ├── leads/          # Lead CRUD & CSV import
│   │   │   ├── properties/     # Property reconciliation
│   │   │   ├── deals/          # Deal pipeline management
│   │   │   ├── communications/ # Message approval queue
│   │   │   ├── underwriting/   # AI underwriting
│   │   │   ├── control-plane/  # Start/Stop controls
│   │   │   ├── marketing/      # Flyer + buyer blast drafts
│   │   │   ├── buyers/         # Buyer CRM + matching
│   │   │   ├── integrations/   # ATTOM / Google / DocuSign adapters
│   │   │   ├── jobs/           # Async job status API
│   │   │   ├── timeline/       # Append-only timeline events
│   │   │   └── webhooks/       # Twilio & DocuSign
│   │   └── prisma/
│   │       └── schema.prisma   # Database schema
│   └── worker/                  # BullMQ workers
├── packages/
│   └── shared/                  # Shared code
│       ├── src/policy/          # Policy engine + rules
│       ├── src/state-machine/   # Deal stage transition rules
│       ├── schemas/             # Zod validation schemas
│       ├── utils/               # Compliance & reconciliation
│       └── agents/              # AI prompt templates
├── docker-compose.yml
└── package.json
```

## Features Implemented

### Core Modules
- ✅ **AuthN/AuthZ**: Descope hosted flow auth + backend token validation + permission checks
- ✅ **Lead Management**: CRUD operations, CSV import, deduplication
- ✅ **Data Triage**: Duplicate detection + merge / mark-distinct
- ✅ **Property Reconciliation**: Multi-source data reconciliation with confidence scoring
- ✅ **Deal Pipeline**: Stage management (new → contacted → negotiating → under_contract → marketing → assigned → closed/lost)
- ✅ **AI Underwriting (Queued)**: API enqueue + worker execution + job status tracking
- ✅ **Communications**: SMS/Email approval queue with compliance checks
- ✅ **Marketing (Queued)**: Flyer + buyer blast draft generation via worker jobs
- ✅ **Buyer CRM**: Buyer CRUD + matching
- ✅ **Control Plane**: Global start/stop controls for side effects
- ✅ **Compliance**: DNC list, consent records, quiet hours
- ✅ **Webhooks**: Twilio inbound/status, DocuSign envelope events
- ✅ **Health Monitoring**: Database, Redis, queue depth, AI cost tracking
- ✅ **Analytics**: KPIs + trends endpoints + dashboard cards
- ✅ **Policy Engine**: Shared policy module enforced at API/worker command boundaries
- ✅ **Timeline Events**: Append-only audit trail for core automation/state changes
- ✅ **Explicit Deal State Machine**: Centralized transition guard for `deal.stage`
- ✅ **Tenant Isolation Hardening**: Tenant-scoped reads/writes across critical modules

### Database Schema
- Multi-tenant accounts & users
- RBAC (roles, permissions, memberships)
- Leads with canonical fields
- Properties with source provenance
- Deals & contracts (DocuSign)
- Messages & approval queue
- DNC list & consent records
- AI cost logs
- Control plane settings
- Audit logs
- Job runs (`JobRun`) for async underwriting/marketing workloads
- Timeline events (`TimelineEvent`) for append-only entity history

### API Endpoints

#### Leads
- `GET /api/leads` - List leads
- `POST /api/leads` - Create lead
- `GET /api/leads/:id` - Get lead details
- `PUT /api/leads/:id` - Update lead
- `POST /api/leads/import/csv` - Import CSV
- `GET /api/leads/duplicates` - Find potential duplicates
- `POST /api/leads/merge` - Merge leads (source → target)
- `POST /api/leads/mark-distinct` - Mark leads as distinct

#### Properties
- `POST /api/properties` - Create property
- `GET /api/properties/:id` - Get property
- `POST /api/properties/:id/reconcile` - Reconcile sources

#### Deals
- `GET /api/deals` - List deals
- `POST /api/deals` - Create deal
- `GET /api/deals/:id` - Get deal
- `PUT /api/deals/:id` - Update deal
- `PUT /api/deals/:id/stage` - Update stage

#### Communications
- `POST /api/communications/messages` - Create message (pending approval)
- `GET /api/communications/messages` - List messages
- `GET /api/communications/approval-queue` - Get pending approvals
- `PUT /api/communications/messages/:id/approve` - Approve message
- `PUT /api/communications/messages/:id/reject` - Reject message

#### Underwriting
- `POST /api/underwriting/analyze/:dealId` - Enqueue underwriting job (returns `jobId`)
- `GET /api/underwriting/result/:dealId` - Get latest cached underwriting result

#### Marketing
- `POST /api/marketing/flyer/:dealId` - Enqueue flyer draft generation (returns `jobId`)
- `POST /api/marketing/buyer-blast/:dealId` - Enqueue buyer blast draft generation (returns `jobId`)
- `GET /api/marketing/flyer/:dealId` - Get latest flyer draft
- `GET /api/marketing/buyer-blast/:dealId` - Get latest buyer blast draft

#### Jobs
- `GET /api/jobs/:jobId` - Get async job status/result (tenant-scoped)

#### Timeline
- `GET /api/timeline/:entityType/:entityId` - Get recent timeline events (tenant-scoped)

#### Analytics
- `GET /api/analytics/kpis` - KPIs summary
- `GET /api/analytics/trends` - Daily trends

#### Integrations
- `GET /api/integrations/attom/lookup` - ATTOM lookup by address
- `GET /api/integrations/geocoding` - Google geocode
- `POST /api/integrations/docusign/envelopes` - Create DocuSign envelope

#### Control Plane
- `GET /api/control-plane` - Get status
- `PUT /api/control-plane` - Update controls

#### Health
- `GET /api/health` - System health check

#### Buyers
- `GET /api/buyers` - List buyers
- `POST /api/buyers` - Create buyer
- `GET /api/buyers/:id` - Get buyer
- `PUT /api/buyers/:id` - Update buyer
- `DELETE /api/buyers/:id` - Delete buyer
- `GET /api/buyers/match/:dealId` - Match buyers to deal

#### Properties (Map / Search)
- `GET /api/properties/map` - Get property map pins (with city/state filters)
- `GET /api/properties/search` - Search properties

#### RentCast Integration
- `GET /api/integrations/rentcast/listings` - Active listings by city/state
- `GET /api/integrations/rentcast/property` - Property record by address
- `GET /api/integrations/rentcast/value` - Value estimate by address

#### Chaos / DLQ Admin
- `POST /api/admin/chaos/twilio-429` - Simulate Twilio rate limit
- `POST /api/admin/chaos/docusign-outage` - Simulate DocuSign outage
- `POST /api/admin/chaos/attom-5xx` - Simulate ATTOM failure
- `POST /api/admin/chaos/clear` - Clear chaos state
- `GET /api/admin/chaos/status` - Get chaos status
- `GET /api/admin/dlq` - List failed jobs
- `POST /api/admin/dlq/:jobId/replay` - Replay failed job

#### Webhooks
- `POST /api/webhooks/twilio/inbound` - Twilio inbound SMS
- `POST /api/webhooks/twilio/status` - Twilio delivery status
- `POST /api/webhooks/docusign` - DocuSign events

## Testing

```bash
npm run test                    # Unit tests (all packages)
npm run e2e                     # Golden path E2E script
npx tsx scripts/security-pentest.ts  # Security pen test (80 checks, no deps)
cd apps/api && npm run test:e2e      # Jest E2E suites
cd apps/api && npm run test:e2e:security  # Security-focused E2E
```

## Environment Variables

Create `.env.local` files in each app directory. See root `.env.sample` for reference.

Required variables:
- `DATABASE_URL` - Postgres connection string
- `NEXT_PUBLIC_DESCOPE_PROJECT_ID` - Descope Project ID (web)
- `NEXT_PUBLIC_DESCOPE_FLOW_ID` - Descope hosted flow id (web)
- `DESCOPE_PROJECT_ID` - Descope Project ID (API)
- `DESCOPE_MANAGEMENT_KEY` - Descope management key (API server only)
- `REDIS_URL` - Redis connection
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_DAILY_COST_CAP` - Daily cost limit (default: 2.0)
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` - Twilio credentials
- `DOCUSIGN_CLIENT_ID`, `DOCUSIGN_CLIENT_SECRET` - DocuSign credentials
- `ATTOM_API_KEY` - ATTOM Property API key
- `GOOGLE_GEOCODING_API_KEY` - Google Geocoding API key

## Current Status / Remaining Work

### Completed
- ✅ Descope migration in web + API auth guard/token validation (lazy init, won't crash without env vars)
- ✅ Shared policy module (`@halo/shared`) and policy enforcement in key API/worker boundaries
- ✅ Queued underwriting + marketing flow (API enqueue, worker execute, job state persistence)
- ✅ Append-only timeline event service + endpoint
- ✅ Explicit deal stage transition state machine wired into stage updates
- ✅ Tenant-scoped data access hardening across leads/deals/properties/communications/integrations
- ✅ Prisma schema pushed for `JobRun` + `TimelineEvent` models
- ✅ Deal detail page with financials, map pin, underwriting results, contracts, timeline
- ✅ PII encryption envelopes + key rotation (`packages/shared/src/crypto/pii-envelope.ts` + `apps/api/src/pii/`)
- ✅ Valuation eval script (`scripts/valuation-eval.ts`)
- ✅ Dark theme UI with green primary + shadcn/ui components across all 14 pages
- ✅ Interactive property map (MapLibre) on dashboard and properties page
- ✅ RentCast API integration for property listings/search
- ✅ OpenClaw bot gateway + 7 custom skills (conditional on `FEATURE_OPENCLAW`)
- ✅ Security pen test suite -- 80/80 passing (`scripts/security-pentest.ts`)
- ✅ 5 Jest E2E test suites (tenant isolation, policy, state machine, jobs, security)
- ✅ GitHub Actions CI pipeline (lint, typecheck, build, migration check)
- ✅ Helmet security headers, body size/depth limits, webhook input validation
- ✅ Chaos engineering drills + DLQ replay admin endpoints
- ✅ Feature flag system (`packages/shared/src/feature-flags.ts`)
- ✅ Typed feature flags for OpenSearch, Claude, OpenClaw, public deal pages, Stripe
- ✅ Database seed script for demo data

### Pending
- [ ] MinIO/S3 document storage pipeline (upload/download for contracts, flyers, marketing materials)
- [ ] OpenSearch integration for property/lead full-text search
- [ ] Wire real ATTOM, Twilio, SendGrid, DocuSign API calls (currently stubbed)
- [ ] Unit test coverage for critical shared packages
- [ ] Production CORS, rate limiting, structured logging, error tracking

## License

Internal use only.

