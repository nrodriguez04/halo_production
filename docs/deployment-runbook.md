# Deployment runbook

How to put Hālo on one server with Docker Compose, keep it running, and get
it back. Written for a single operator; every command is copy-pasteable.
Nothing in this document contains a secret.

The stack (`docker-compose.prod.yml`): Postgres 16 (pgvector), Redis 7,
RustFS (S3-compatible object store for the documents library), a one-shot
`migrate` container, the `api` (NestJS, :3001), the `web` (Next.js, :3000),
the `worker` (BullMQ, health on :3003) and Caddy (TLS, the only public
port). Only Caddy listens on the internet; the api, web and stores bind to
`127.0.0.1` or the compose network.

## 0. What you need before you start

| Item | Why | Where it goes |
|---|---|---|
| A Linux VM, 2 vCPU / 4 GB RAM / 40 GB disk minimum (8 GB if you run the worker's model calls heavily), Ubuntu 22.04+ or Debian 12 | Runs the stack | `scripts/deploy/bootstrap.sh` installs Docker on it |
| A domain with three records pointing at the VM: `app.<domain>`, `api.<domain>`, `<domain>` | Caddy issues TLS per hostname | `Caddyfile` |
| Ports 80 and 443 open inbound; everything else closed | Caddy, ACME | VM firewall / security group |
| A Descope project (prod) with the sign-in flow published and your users' roles set (Platform Admin for whoever runs `/admin`) | Auth | `DESCOPE_PROJECT_ID`, `DESCOPE_MANAGEMENT_KEY` |
| Provider keys you want live at launch: OpenAI (with credits), Twilio (A2P 10DLC approved, a number), SendGrid (verified sender), ATTOM, RentCast/Realie, Google Geocoding, DocuSign JWT keys | Integrations | Entered on `/admin/integrations` after first login (preferred) or in `.env` |
| A mailbox for ACME/expiry notices | Caddy | `Caddyfile` `email` |
| Somewhere off the VM for backups (an S3 bucket or a second disk) | Recovery | `scripts/deploy/backup.sh` |

Secrets are generated on the VM, never typed from chat or email. The
`PII_*` keys protect every phone and email in the database: **losing them
makes contact data unrecoverable**, so they go in your password manager the
day you generate them.

## 1. First deploy

```bash
# on the VM, as a user in the docker group
git clone https://github.com/nrodriguez04/halo_production.git /opt/halo
cd /opt/halo
cp .env.prod.example .env
scripts/deploy/bootstrap.sh          # installs Docker if missing, fills generated secrets into .env, checks the rest
```

`bootstrap.sh` generates `POSTGRES_PASSWORD`, `REDIS_PASSWORD`,
`MINIO_ROOT_PASSWORD`, `SECRETS_ENCRYPTION_KEY`, `PII_ENCRYPTION_KEY_V1`,
`PII_INDEX_KEY` and `INTERNAL_API_TOKEN` when they are empty, then stops
and tells you which required values are still missing (Descope, domains,
email sender). Edit `.env` and `Caddyfile` (replace `haloacquisitions.com`
with your domain in all three hostnames), then:

```bash
scripts/deploy/deploy.sh             # build images, run migrations, start everything, run the smoke checks
```

What `deploy.sh` does, in order: `docker compose pull/build` (api, web,
worker and migrate), starts Postgres/Redis/RustFS and waits for health, runs
the `migrate` container (`prisma migrate deploy`), stops if that image does
not hold every migration in the checkout, starts api/web/worker/caddy, waits
for the api health endpoint and the worker's health check, then runs
`scripts/deploy/smoke.sh`.

`migrate` is built from the api's Dockerfile but is an image of its own
(`halo-migrate`). Until 2026-10-24 the deploy did not rebuild it, so it kept
the first deploy's migrations and skipped every later one without an error.
If you run migrations by hand, build it first:
`docker compose -f docker-compose.prod.yml build migrate`.

The web image bakes `NEXT_PUBLIC_API_URL`, `DESCOPE_PROJECT_ID`,
`NEXT_PUBLIC_DESCOPE_FLOW_ID` and `DESCOPE_BASE_URL` into the browser bundle
when it is built (compose passes them as build args). After changing any of
them, rebuild it: `docker compose -f docker-compose.prod.yml build web`.

### Descope in production

Set these in the Descope console before the first login:

| Setting | Value | Why |
|---|---|---|
| Custom domain | `auth.<domain>` (a CNAME Descope gives you) | `DESCOPE_BASE_URL`, used by the api and baked into the web bundle |
| Session management | **Manage in cookies** | the session and refresh tokens never reach page JavaScript |
| Cookie domain | `<domain>` (the parent) | `app.<domain>` and `api.<domain>` both receive the cookies |
| Cookie SameSite | Lax | the app and api are the same site |
| Users | each with a tenant named after the account (`halo-hq`) and a role | without a tenant the api answers 403 and sign-in says why |

How the app uses it:
- The web sends cookies with every api call (`credentials: 'include'`).
- The api takes a bearer header when there is one, otherwise the `DS` session cookie (`apps/api/src/auth/session-token.ts`). Set `DESCOPE_SESSION_COOKIE` only if you renamed it.
- A write authenticated by the cookie alone must come from an origin in `CORS_ORIGINS` (`https://app.<domain>`), so another site cannot borrow the cookie. Reads are allowed either way, since another site cannot read the answers.
- **Local development keeps "Manage in response body".** Cookies set on the custom domain are invisible to `localhost`, so a local login with cookie management bounces back to sign-in.

First login: open `https://app.<domain>`, sign in with the Descope user you
made Platform Admin, go to **Admin → Integrations** and enter provider keys
(they are encrypted at rest with `SECRETS_ENCRYPTION_KEY`; env values are
only the fallback). Click **Test** on each card. Then **Admin → Control
Plane**: the kill switch starts enabled, but email, texts and both
marketing switches start **off** and stay off until someone authorized
turns them on (docs/communications.md); agents start in `draft_only`
autonomy (**Admin → Agents**).

Webhooks to configure on the provider side (all HTTPS on `api.<domain>`):

| Provider | URL | Auth |
|---|---|---|
| Twilio inbound SMS | `https://api.<domain>/api/webhooks/twilio/inbound` | signature with `TWILIO_AUTH_TOKEN` |
| Twilio status callback | `https://api.<domain>/api/webhooks/twilio/status` | same |
| DocuSign Connect | `https://api.<domain>/api/webhooks/docusign` | HMAC with `DOCUSIGN_CONNECT_SECRET` |
| SendGrid Inbound Parse | `https://api.<domain>/api/webhooks/email/inbound?token=<SENDGRID_INBOUND_TOKEN>` | the token in the URL; MX for `reply.<domain>` -> `mx.sendgrid.net`; set `EMAIL_REPLY_TO` |

Twilio signs the public https URL, which is why `TRUST_PROXY=1` is set and
Caddy is the only hop in front of the api. Do not put another proxy in
between without updating that.

## 2. Routine deploy (new version)

```bash
cd /opt/halo
git fetch && git checkout main && git pull --ff-only
scripts/deploy/deploy.sh
```

Migrations run before the new api starts. The script refuses to continue
when a migration fails and leaves the previous containers running. For a
change that needs manual steps the PR says so in its description and this
file gets a dated entry under **Migration notes** below.

## 3. Migration notes

- **A database that predates the PII sealing (October 2026)**:
  `prisma migrate deploy` stops at `20261010120100_drop_plaintext_contacts`
  by design. Run, in this order:

  ```bash
  docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma   # stops at the drop migration
  docker compose -f docker-compose.prod.yml run --rm api npm run db:backfill-pii
  docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate resolve --rolled-back 20261010120100_drop_plaintext_contacts --schema=apps/api/prisma/schema.prisma
  docker compose -f docker-compose.prod.yml run --rm migrate npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma
  docker compose -f docker-compose.prod.yml run --rm api npm run db:backfill-pii
  ```

  A fresh production database migrates straight through.
- Provider registry, pricing rules and default budget buckets are seeded by
  the api at boot (idempotent), so a new provider or action never needs a
  manual seed.

## 4. Backups and restore

`scripts/deploy/backup.sh` dumps Postgres (`pg_dump -Fc`) and mirrors the
RustFS bucket (the documents library) into `/var/backups/halo/<date>/`,
keeps 14 days, and, when `BACKUP_S3_URI` is set in `.env`, copies the day's
folder there with the `aws` CLI. Install it as a nightly cron:

```bash
sudo crontab -e
# 03:15 every day, log to syslog
15 3 * * * cd /opt/halo && scripts/deploy/backup.sh 2>&1 | logger -t halo-backup
```

Restore (into an empty stack, after `deploy.sh` has created the containers):

```bash
scripts/deploy/restore.sh /var/backups/halo/2026-10-12
```

The script stops api/worker, restores the database dump and the bucket,
restarts them and runs the smoke checks. **The dump is useless without the
`PII_*` keys from the `.env` that wrote it**, so back up `.env` separately
(password manager, not the same bucket).

Test a restore once before launch, on a scratch VM.

## 5. Daily operations

- **Health**: `https://api.<domain>/api/health/live` (liveness) and
  `/api/health/ready` (database, Redis, object store). The web and worker
  containers have compose healthchecks; `docker compose ps` shows them.
- **Logs**: `docker compose -f docker-compose.prod.yml logs -f api worker`.
  The api logs JSON (pino); `grep '"level":50'` for errors.
- **Queues and failures**: **Admin → Chaos & DLQ** shows dead-lettered jobs
  and lets you retry them. **Admin → Automation** and **Admin → Agents**
  show every run and what is waiting for approval.
- **Spend**: **Admin → API Spend** and **Admin → Cost Governance** (budget
  buckets, pending manual approvals). Caps block before money is spent.
- **Kill switch**: **Admin → Control Plane → Disable all automation** stops
  every side effect (sends, paid calls, agents) within one tick; drafts and
  reads keep working.
- **Alerts**: set `ALERT_WEBHOOK_URL` in `.env` to a Slack, Discord or Teams
  incoming webhook. The api posts unexpected errors (any 500), jobs that
  failed after their retries (checked every 5 minutes), and budgets that
  reach 95% or 100%; repeats are held back for 15 minutes. **Admin →
  Control Plane → Alerts → Send test alert** checks the webhook.
- **Downtime**: install the on-box watcher, which alerts once when the api,
  worker or web stop answering and once when they recover:

  ```bash
  sudo crontab -e
  */5 * * * * cd /opt/halo && scripts/deploy/healthwatch.sh 2>&1 | logger -t halo-healthwatch
  ```

  It cannot report a dead server, so also point a free external uptime
  monitor (UptimeRobot, Better Stack) at
  `https://api.<domain>/api/health/live`.
- **Rotate a provider key**: enter the new value on the Integrations card
  and click Test; nothing restarts. Rotate `TWILIO_AUTH_TOKEN` there and in
  Twilio at the same time (webhook signatures depend on it).

## 6. Rollback

```bash
cd /opt/halo
git log --oneline -5                 # pick the last good commit
git checkout <good-sha>
scripts/deploy/deploy.sh --no-migrate
```

Migrations are forward-only; if a bad release also migrated, restore the
backup taken before the deploy (`deploy.sh` writes one to
`/var/backups/halo/pre-deploy-<timestamp>` when `BACKUP_BEFORE_DEPLOY=1`,
the default) and then check out the good commit.

## 7. Smoke checklist (after every deploy)

`scripts/deploy/smoke.sh` checks: api liveness and readiness, the web
responds, `/api/internal/*` is **not** reachable through Caddy (404), the
Twilio and DocuSign webhooks reject unsigned posts (403), and the worker
health port answers inside the compose network. Then by hand, once per
release:

1. Sign in, open **Admin → Integrations**, every live provider shows a
   recent successful test.
2. **Leads → Markets**: run one market by hand; a sourcing run appears in
   **Admin → Automation**.
3. Import or enrich one lead; a Lead Analyst run appears in **Admin →
   Agents**. Approve or reject it.
4. Send yourself a test SMS and email draft through the approval queue.
5. Open a deal, **Contracts → Send for signature** to yourself as `other`,
   sign in DocuSign's email, confirm the signed copy shows up under
   **Documents**.

## 8. Security posture (what the stack already does)

- TLS everywhere via Caddy with HSTS; security headers on every response.
- `/api/internal/*` returns 404 at the edge; the worker reaches it only on
  the compose network with a bearer token.
- Phones and emails are envelope-encrypted with a blind index; provider
  keys are encrypted at rest; the worker never holds PII or provider keys.
- Webhooks verify signatures (Twilio HMAC-SHA1, DocuSign HMAC-SHA256).
- Rate limiting on the api; CORS limited to `CORS_ORIGINS`.

Keep the VM patched (`unattended-upgrades`), SSH on keys only, and the
Docker socket off the network.

## 9. Scaling later

One VM carries the pilot. When it does not: move Postgres to a managed
instance (change `DATABASE_URL`, keep the migrate step), move the bucket to
S3 (`S3_*` variables, same API), and run a second `worker` replica
(`docker compose up -d --scale worker=2`; BullMQ shares the queue). The api
is stateless behind Caddy; `--scale api=2` works once sessions are not
needed on one node (they are not).
