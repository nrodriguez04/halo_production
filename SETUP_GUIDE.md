# Halo Production — Complete Setup Guide

This guide walks you through setting up every external service, configuring environment variables, and deploying the application.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Docker (Local Development)](#2-docker-local-development)
3. [Descope (Authentication)](#3-descope-authentication)
4. [Twilio (SMS)](#4-twilio-sms)
5. [SendGrid (Email)](#5-sendgrid-email)
6. [DocuSign (e-Signatures)](#6-docusign-e-signatures)
7. [ATTOM (Property Data)](#7-attom-property-data)
8. [Google Geocoding](#8-google-geocoding)
9. [RentCast (Rental Data)](#9-rentcast-rental-data)
10. [PropertyRadar (Property Intelligence)](#10-propertyradar-property-intelligence)
11. [OpenAI (AI/LLM)](#11-openai-aillm)
12. [OpenClaw (Agent Orchestration)](#12-openclaw-agent-orchestration)
13. [Environment Files](#13-environment-files)
14. [Running Locally](#14-running-locally)
15. [Production Deployment](#15-production-deployment)
16. [Post-Deployment Checklist](#16-post-deployment-checklist)

---

## 1. Prerequisites

Install these on your development machine:

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **Docker Desktop** — [docker.com](https://www.docker.com/products/docker-desktop/)
- **Git** — [git-scm.com](https://git-scm.com)

Clone the repo and install dependencies:

```bash
git clone https://github.com/nrodriguez04/halo_production.git
cd halo_production
npm install
```

---

## 2. Docker (Local Development)

Docker runs the infrastructure services (Postgres, Redis, MinIO, Mailhog) that the app depends on.

### Start infrastructure

```bash
docker compose up -d
```

This starts:

| Service | Port | Purpose |
|---------|------|---------|
| **PostgreSQL** (pgvector) | 5432 | Database — user: `halo`, password: `halo_dev_password`, db: `halo_dev` |
| **Redis** | 6379 | Job queues (BullMQ), caching |
| **MinIO** | 9000 (API), 9001 (Console) | Document/file storage (S3-compatible) |
| **Mailhog** | 1025 (SMTP), 8025 (UI) | Email testing — view sent emails at `http://localhost:8025` |
| **OpenSearch** | 9200 | Full-text search (optional) |

### Verify services are running

```bash
docker compose ps
```

All services should show `Up (healthy)` or `running`.

### Run database migrations and seed

```bash
npm run db:migrate
npm run db:seed
```

This creates all tables and populates demo data (leads, deals, properties, automation runs, API cost logs).

### Access MinIO Console

Open `http://localhost:9001` in your browser. Login: `minioadmin` / `minioadmin`. The app auto-creates a `halo-documents` bucket on startup.

---

## 3. Descope (Authentication)

Descope handles user authentication (sign-in, JWT tokens, session management).

### Step 1: Create a Descope account

Go to [descope.com](https://www.descope.com) and sign up for a free account.

### Step 2: Create a project

1. In the Descope console, click **Create Project**
2. Name it (e.g., "Halo Production")
3. Copy the **Project ID** — you'll need this for both API and Web env files

### Step 3: Configure a Flow

1. Go to **Flows** in the left sidebar
2. Create or edit a flow named **`sign-in`** (this must match `NEXT_PUBLIC_DESCOPE_FLOW_ID`)
3. Add your desired sign-in methods (email OTP, magic link, social login, etc.)
4. Save the flow

### Step 4: Configure Tenants (for multi-tenancy)

1. Go to **Tenants** in the left sidebar
2. Create a tenant (e.g., "halo-hq") — this becomes the `accountId` used throughout the app
3. Assign your user(s) to this tenant

**Important:** The API's `AuthGuard` requires a tenant claim in the JWT. If no tenant is configured, API requests will return 403.

### Step 5: Set environment variables

```
# apps/api/.env.local
DESCOPE_PROJECT_ID=P2abc123your_project_id

# apps/web/.env.local
NEXT_PUBLIC_DESCOPE_PROJECT_ID=P2abc123your_project_id
NEXT_PUBLIC_DESCOPE_FLOW_ID=sign-in
```

### Optional: Management Key

If you want server-side user management:
1. Go to **Settings → Access Keys** in Descope
2. Create a management key
3. Add to API env: `DESCOPE_MANAGEMENT_KEY=your_key`

---

## 4. Twilio (SMS)

Twilio enables SMS sending and receiving for lead/deal communications.

### Step 1: Create a Twilio account

Go to [twilio.com](https://www.twilio.com) and sign up. You get a trial account with free credits.

### Step 2: Get your credentials

From the Twilio Console dashboard:
1. Copy your **Account SID** (e.g., `ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`)
2. Copy your **Auth Token** (click to reveal)
3. Buy or use a trial **phone number** (e.g., `+15551234567`)

### Step 3: Configure webhooks (for receiving SMS)

This is needed only when your app is publicly accessible:

1. Go to **Phone Numbers → Manage → Active Numbers**
2. Click your number
3. Under **Messaging**, set:
   - **When a message comes in**: `https://your-domain.com/api/webhooks/twilio/inbound` (HTTP POST)
   - **Status callback URL**: `https://your-domain.com/api/webhooks/twilio/status` (HTTP POST)

For local development, use [ngrok](https://ngrok.com) to expose your local API:
```bash
ngrok http 3001
# Use the ngrok URL for webhook configuration
```

### Step 4: Set environment variables

```
# apps/api/.env.local
TWILIO_AUTH_TOKEN=your_auth_token_here

# apps/worker/.env.local
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+15551234567
```

---

## 5. SendGrid (Email)

SendGrid handles outbound email. In development, Mailhog captures all emails locally.

### Step 1: Create a SendGrid account

Go to [sendgrid.com](https://sendgrid.com) and sign up.

### Step 2: Create an API Key

1. Go to **Settings → API Keys**
2. Click **Create API Key**
3. Give it **Full Access** (or at minimum: Mail Send)
4. Copy the key — it's only shown once

### Step 3: Verify a sender

1. Go to **Settings → Sender Authentication**
2. Verify a single sender email (e.g., `noreply@yourdomain.com`)

### Step 4: Set environment variables

```
# apps/worker/.env.local
USE_SENDGRID=true
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
```

**For local development**, leave `USE_SENDGRID` unset — emails go to Mailhog (`localhost:1025`), viewable at `http://localhost:8025`.

---

## 6. DocuSign (e-Signatures)

DocuSign handles electronic signature workflows for deals.

### Step 1: Create a DocuSign developer account

Go to [developers.docusign.com](https://developers.docusign.com) and sign up for a free sandbox.

### Step 2: Create an integration

1. In the DocuSign admin, go to **Apps and Keys**
2. Click **Add App / Integration Key**
3. Copy the **Integration Key** (this is `DOCUSIGN_CLIENT_ID`)
4. Add a **Secret Key** (this is `DOCUSIGN_CLIENT_SECRET`)
5. Note your **API Account ID** (this is `DOCUSIGN_ACCOUNT_ID`)

### Step 3: Set up Connect (webhooks)

1. Go to **Settings → Connect**
2. Click **Add Configuration**
3. Set the URL to: `https://your-domain.com/api/webhooks/docusign`
4. Enable events: Envelope Sent, Delivered, Completed, Declined, Voided
5. Under **Security**, enable HMAC and set a secret — this becomes `DOCUSIGN_CONNECT_SECRET`

### Step 4: Set environment variables

```
# apps/api/.env.local
DOCUSIGN_BASE_URL=https://demo.docusign.net
DOCUSIGN_CLIENT_ID=your_integration_key
DOCUSIGN_CLIENT_SECRET=your_secret_key
DOCUSIGN_ACCOUNT_ID=your_api_account_id
DOCUSIGN_CONNECT_SECRET=your_hmac_secret
```

**For production:** Change `DOCUSIGN_BASE_URL` to `https://www.docusign.net`.

---

## 7. ATTOM (Property Data)

ATTOM provides property details, assessments, and sale history.

### Step 1: Get an ATTOM API account

Go to [api.gateway.attomdata.com](https://api.gateway.attomdata.com) or contact ATTOM sales. You'll need a paid plan.

### Step 2: Get your API key

From the ATTOM developer portal, copy your API key.

### Step 3: Set environment variables

```
# apps/api/.env.local AND apps/worker/.env.local
ATTOM_API_KEY=your_attom_api_key
ATTOM_BASE_URL=https://api.gateway.attomdata.com
```

**Cost:** ~$0.10 per API call. The app logs costs to the API Spend dashboard.

---

## 8. Google Geocoding

Google Geocoding converts addresses to lat/lng coordinates for property mapping.

### Step 1: Create a Google Cloud project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable the **Geocoding API** under APIs & Services → Library

### Step 2: Create an API key

1. Go to **APIs & Services → Credentials**
2. Click **Create Credentials → API Key**
3. Restrict the key to **Geocoding API** only (recommended)

### Step 3: Set environment variables

```
# apps/api/.env.local AND apps/worker/.env.local
GOOGLE_GEOCODING_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Cost:** ~$0.005 per call ($5 per 1,000). Google offers $200/month free credit.

---

## 9. RentCast (Rental Data)

RentCast provides rental estimates, property records, and listings.

### Step 1: Get a RentCast API account

Go to [rentcast.io](https://rentcast.io) and sign up for an API plan.

### Step 2: Get your API key

From the RentCast dashboard, copy your API key.

### Step 3: Set environment variables

```
# apps/api/.env.local
RENTCAST_API_KEY=your_rentcast_api_key
```

**Cost:** ~$0.05 per call depending on your plan.

---

## 10. PropertyRadar (Property Intelligence)

PropertyRadar provides property data, skip tracing (phone/email lookup), liens, and comparables.

### Step 1: Get a PropertyRadar API account

Go to [propertyradar.com](https://www.propertyradar.com) and sign up. API access requires a paid plan.

### Step 2: Get your API key

From your PropertyRadar account settings, generate an API key/Bearer token.

### Step 3: Set environment variables

```
# apps/api/.env.local AND apps/worker/.env.local
PROPERTYRADAR_API_KEY=your_api_key
PROPERTYRADAR_BASE_URL=https://api.propertyradar.com/v1
```

**Cost:** ~$0.02 per call. Used for property search, contact lookup (skip tracing), and enrichment.

---

## 11. OpenAI (AI/LLM)

OpenAI powers the AI underwriting, marketing content generation, and agent reasoning.

### Step 1: Create an OpenAI account

Go to [platform.openai.com](https://platform.openai.com) and sign up.

### Step 2: Create an API key

1. Go to **API Keys** in the left sidebar
2. Click **Create new secret key**
3. Copy it — it's only shown once

### Step 3: Set environment variables

```
# apps/worker/.env.local
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_DAILY_COST_CAP=5
```

You can also set the API key through the admin console's **Integrations** page (stored encrypted in the database).

The daily cost cap is enforced by the app — AI requests are blocked when the cap is reached. You can adjust this from the admin dashboard.

---

## 12. OpenClaw (Agent Orchestration)

OpenClaw is the AI agent orchestration layer. It's optional — the app works without it.

### Step 1: Set up OpenClaw

Follow the [OpenClaw documentation](https://github.com/openclaw-ai/openclaw) to run an OpenClaw gateway. For local development, this typically runs on `ws://localhost:18789`.

### Step 2: Set environment variables

```
# apps/worker/.env.local
FEATURE_OPENCLAW=true
OPENCLAW_GATEWAY_URL=ws://localhost:18789
OPENCLAW_AUTH_TOKEN=your_openclaw_token
```

**If you don't have OpenClaw set up**, leave `FEATURE_OPENCLAW` unset or set to `false`. The worker will start without the OpenClaw module.

---

## 13. Environment Files

Create `.env.local` files for each app by copying the examples:

```bash
cp apps/api/.env.local.example apps/api/.env.local
cp apps/web/.env.local.example apps/web/.env.local
cp apps/worker/.env.local.example apps/worker/.env.local
```

### Minimum required to run locally

The absolute minimum to get the app running (with limited functionality):

```
# apps/api/.env.local
DATABASE_URL=postgresql://halo:halo_dev_password@localhost:5432/halo_dev
REDIS_URL=redis://localhost:6379
DESCOPE_PROJECT_ID=<your_descope_project_id>

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NEXT_PUBLIC_DESCOPE_PROJECT_ID=<your_descope_project_id>
NEXT_PUBLIC_DESCOPE_FLOW_ID=sign-in

# apps/worker/.env.local
DATABASE_URL=postgresql://halo:halo_dev_password@localhost:5432/halo_dev
REDIS_URL=redis://localhost:6379
```

### Generate an encryption key

For the integration secrets feature (storing API keys securely):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the output to: `SECRETS_ENCRYPTION_KEY=<64_hex_chars>` in `apps/api/.env.local`.

### Full API .env.local reference

```env
# Core
DATABASE_URL=postgresql://halo:halo_dev_password@localhost:5432/halo_dev
REDIS_URL=redis://localhost:6379
PORT=3001
CORS_ORIGINS=http://localhost:3000

# Auth
DESCOPE_PROJECT_ID=your_project_id
DESCOPE_MANAGEMENT_KEY=optional_mgmt_key

# Secrets
SECRETS_ENCRYPTION_KEY=64_hex_chars_here

# Twilio
TWILIO_AUTH_TOKEN=your_token

# DocuSign
DOCUSIGN_BASE_URL=https://demo.docusign.net
DOCUSIGN_CLIENT_ID=your_client_id
DOCUSIGN_CLIENT_SECRET=your_client_secret
DOCUSIGN_ACCOUNT_ID=your_account_id
DOCUSIGN_CONNECT_SECRET=your_hmac_secret

# Data providers
ATTOM_API_KEY=your_key
ATTOM_BASE_URL=https://api.gateway.attomdata.com
GOOGLE_GEOCODING_API_KEY=your_key
RENTCAST_API_KEY=your_key
PROPERTYRADAR_API_KEY=your_key
PROPERTYRADAR_BASE_URL=https://api.propertyradar.com/v1

# Storage (MinIO defaults work for local dev)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=halo-documents
S3_REGION=us-east-1
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
```

---

## 14. Running Locally

### Start everything

```bash
# 1. Start Docker services (if not already running)
docker compose up -d

# 2. Run database migrations
npm run db:migrate

# 3. Seed the database (optional, for demo data)
npm run db:seed

# 4. Start the dev server (API + Web + Worker)
npm run dev
```

### Access the application

| Service | URL |
|---------|-----|
| **Web App** | http://localhost:3000 |
| **API** | http://localhost:3001/api |
| **API Health** | http://localhost:3001/api/health/live |
| **Mailhog** (email UI) | http://localhost:8025 |
| **MinIO Console** | http://localhost:9001 |
| **Prisma Studio** (DB browser) | `npm run db:studio` → http://localhost:5555 |

### Useful commands

```bash
npm run dev              # Start all apps in dev mode
npm run build            # Build all apps
npm run db:migrate       # Run pending database migrations
npm run db:seed          # Seed database with demo data
npm run db:studio        # Open Prisma Studio (DB browser)
npm run typecheck        # Type-check all apps
npm run lint             # Lint all apps
npm run test             # Run tests
```

---

## 15. Production Deployment

### Option A: Docker Compose (simplest)

The repo includes `docker-compose.prod.yml` which orchestrates all services.

#### Step 1: Set up your server

- A Linux VPS with Docker installed (e.g., DigitalOcean, AWS EC2, Hetzner)
- Minimum: 2 CPU, 4GB RAM
- A domain name pointed to your server's IP

#### Step 2: Create a production env file

Create `.env` on your server:

```env
# Required
POSTGRES_PASSWORD=a_strong_random_password
MINIO_ROOT_PASSWORD=another_strong_password
DESCOPE_PROJECT_ID=your_project_id
NEXT_PUBLIC_API_URL=https://yourdomain.com/api

# Recommended
REDIS_PASSWORD=redis_password
SECRETS_ENCRYPTION_KEY=64_hex_chars

# Integration keys
TWILIO_AUTH_TOKEN=xxx
TWILIO_ACCOUNT_SID=xxx
TWILIO_PHONE_NUMBER=+15551234567
ATTOM_API_KEY=xxx
GOOGLE_GEOCODING_API_KEY=xxx
PROPERTYRADAR_API_KEY=xxx
RENTCAST_API_KEY=xxx
OPENAI_API_KEY=xxx
SENDGRID_API_KEY=xxx
SENDGRID_FROM_EMAIL=noreply@yourdomain.com
USE_SENDGRID=true
```

#### Step 3: Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

#### Step 4: Run migrations

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

#### Step 5: Set up a reverse proxy

Use **nginx** or **Caddy** to handle HTTPS and route traffic:

```nginx
# /etc/nginx/sites-available/halo
server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    # Web app
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

For **Caddy** (auto-HTTPS):
```
yourdomain.com {
    handle /api/* {
        reverse_proxy localhost:3001
    }
    handle {
        reverse_proxy localhost:3000
    }
}
```

#### Step 6: Set up SSL

With **Let's Encrypt**:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

Or just use **Caddy** which handles SSL automatically.

### Option B: Cloud Platform

For platforms like **Railway**, **Render**, **Fly.io**, or **AWS ECS**:

1. Deploy each app separately (api, web, worker)
2. Use managed Postgres (e.g., Supabase, Neon, RDS)
3. Use managed Redis (e.g., Upstash, ElastiCache)
4. Set all environment variables in the platform's dashboard
5. Run `prisma migrate deploy` as a release command

---

## 16. Post-Deployment Checklist

After deploying, verify these:

- [ ] **Web app loads** — Visit your domain and see the sign-in page
- [ ] **Authentication works** — Sign in via Descope and reach the dashboard
- [ ] **Health check passes** — `GET /api/health/live` returns `{"status":"ok"}`
- [ ] **Database connected** — Health check shows `database: {"status":"ok"}`
- [ ] **Redis connected** — Health check shows `redis: {"status":"ok"}`
- [ ] **Admin dashboard loads** — Navigate to `/admin` and see the control plane
- [ ] **Kill switch works** — Toggle the master switch and verify it re-enables
- [ ] **Cost cap saves** — Change the daily cost cap and verify it persists
- [ ] **Twilio webhooks** — Send a test SMS to your Twilio number
- [ ] **DocuSign webhooks** — Trigger a test envelope event
- [ ] **API Spend dashboard** — Visit `/admin/api-spend` and verify data appears

### Security reminders

- [ ] All `.env` files are excluded from git (check `.gitignore`)
- [ ] `SECRETS_ENCRYPTION_KEY` is set and backed up securely
- [ ] `CORS_ORIGINS` only includes your production domain
- [ ] Twilio and DocuSign webhook secrets are configured
- [ ] Database password is strong and not the dev default
- [ ] MinIO credentials are changed from defaults

### Update webhook URLs

Once you have a public domain:

1. **Twilio Console** → Phone Number → Messaging webhooks → update to `https://yourdomain.com/api/webhooks/twilio/inbound`
2. **DocuSign Connect** → Update URL to `https://yourdomain.com/api/webhooks/docusign`
