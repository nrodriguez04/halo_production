# Hālo Hosting Migration

Step-by-step guide to migrate Hālo from local development to production at
**haloacquisitions.com**.

This guide assumes the cheapest reasonable path:

- **Cloudflare Registrar** for the domain
- **Cloudflare DNS / WAF / SSL** in front of everything
- **One Hetzner Cloud VPS** (CX22, ~$5/mo) running the existing
  `docker-compose.prod.yml` (api + worker + web + Postgres + Redis + MinIO)
- **Caddy** as a reverse proxy with automatic Let's Encrypt
- Optional later upgrades: Neon (Postgres), Cloudflare R2 (storage), Vercel (web),
  Cloudflare Tunnel (no inbound ports)

Subdomain layout used throughout:

| Subdomain                     | Service        |
| ----------------------------- | -------------- |
| `app.haloacquisitions.com`    | Web (Next.js)  |
| `api.haloacquisitions.com`    | API (NestJS)   |
| `haloacquisitions.com`        | Redirect → app |

Estimated all-in monthly cost at launch: **~$6–7/mo**.

---

## Phase 0 — Pre-flight

### 0.1 Make accounts (free tiers fine)

- [ ] **Cloudflare** (registrar + DNS + WAF)
- [ ] **Hetzner Cloud** (VPS) — DigitalOcean / Vultr also work
- [ ] **Descope** — create a separate **prod** project (don't reuse dev)
- [ ] **SendGrid** (or Resend) for outbound email
- [ ] **Twilio** — provision a live number for prod
- [ ] **DocuSign** — sandbox until ready, then production
- [ ] Provider API keys: ATTOM, RentCast, PropertyRadar, Google Geocoding, OpenAI

### 0.2 Generate prod secrets locally

Run on your laptop and **store the outputs in a password manager**. Do not commit them.

```powershell
# 64-hex SECRETS_ENCRYPTION_KEY (must be different from dev)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Strong DB / Redis / MinIO passwords (run three times)
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

You will need:

- `SECRETS_ENCRYPTION_KEY` (64 hex chars, prod-only)
- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `MINIO_ROOT_PASSWORD`
- The new prod `DESCOPE_PROJECT_ID`

### 0.3 Decide an SSH key

If you don't already have one on Windows:

```powershell
ssh-keygen -t ed25519 -C "halo-prod"
# public key: ~/.ssh/id_ed25519.pub
```

---

## Phase 1 — Domain (Cloudflare Registrar)

1. Cloudflare dashboard → **Domain Registration → Register Domains**.
2. Search `haloacquisitions.com`, purchase. WHOIS privacy is automatic.
3. The domain lands on Cloudflare DNS automatically. Verify at
   **Websites → haloacquisitions.com → DNS**.
4. Enable DNSSEC: **DNS → Settings → DNSSEC → Enable**.

Don't add A/CNAME records yet — wait for the VPS IP in Phase 2.

---

## Phase 2 — Provision the VPS (Hetzner)

1. Hetzner Cloud → Create Project → **Add Server**:
   - **Location:** closest to you (e.g., Ashburn, VA or Hillsboro, OR)
   - **Image:** Ubuntu 24.04
   - **Type:** **CX22** (2 vCPU, 4 GB RAM, 40 GB SSD) — ~$5/mo
   - **Networking:** IPv4 + IPv6 (free)
   - **SSH key:** upload `~/.ssh/id_ed25519.pub`
   - **Name:** `halo-prod-1`
2. Create. Note the public IPv4 (example below: `5.78.12.34`).
3. SSH in:

   ```powershell
   ssh root@5.78.12.34
   ```

### 2.1 Harden the server

```bash
adduser halo
usermod -aG sudo halo
mkdir -p /home/halo/.ssh
cp ~/.ssh/authorized_keys /home/halo/.ssh/
chown -R halo:halo /home/halo/.ssh
chmod 700 /home/halo/.ssh
chmod 600 /home/halo/.ssh/authorized_keys

sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart ssh

ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

apt update && apt upgrade -y
apt install -y unattended-upgrades
dpkg-reconfigure --priority=low unattended-upgrades
```

From now on use `ssh halo@5.78.12.34`.

### 2.2 Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker halo
exit
```

Reconnect, verify:

```bash
docker version
docker compose version
```

---

## Phase 3 — Get the code on the VPS

For a private repo, create a deploy key first:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/halo_deploy -N ""
cat ~/.ssh/halo_deploy.pub
# add as a Deploy Key (read-only) on the GitHub repo
```

Configure SSH to use it:

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
    IdentityFile ~/.ssh/halo_deploy
    IdentitiesOnly yes
EOF
```

Clone:

```bash
sudo mkdir -p /opt/halo
sudo chown halo:halo /opt/halo
cd /opt/halo
git clone git@github.com:<your-org>/halo_production.git .
```

---

## Phase 4 — Production env file

Create `/opt/halo/.env`:

```bash
nano /opt/halo/.env
```

Paste and fill in:

```env
# ── Core ───────────────────────────────────────────────
POSTGRES_USER=halo
POSTGRES_PASSWORD=<strong_random>
POSTGRES_DB=halo_prod
REDIS_PASSWORD=<strong_random>
MINIO_ROOT_USER=halo_minio
MINIO_ROOT_PASSWORD=<strong_random>

# ── Auth (Descope - PROD project) ──────────────────────
DESCOPE_PROJECT_ID=P_prod_xxx
DESCOPE_MANAGEMENT_KEY=
NEXT_PUBLIC_DESCOPE_FLOW_ID=sign-in

# ── Public URLs ────────────────────────────────────────
NEXT_PUBLIC_API_URL=https://api.haloacquisitions.com/api
CORS_ORIGINS=https://app.haloacquisitions.com

# ── Encryption ─────────────────────────────────────────
SECRETS_ENCRYPTION_KEY=<64_hex_chars>

# ── AI cost cap ────────────────────────────────────────
OPENAI_DAILY_COST_CAP=5

# ── Integrations (fill as you wire each one) ───────────
TWILIO_AUTH_TOKEN=
DOCUSIGN_CONNECT_SECRET=
ATTOM_API_KEY=
PROPERTYRADAR_API_KEY=
GOOGLE_GEOCODING_API_KEY=

# ── OpenClaw (off until ready) ─────────────────────────
FEATURE_OPENCLAW=false
```

Lock it down:

```bash
chmod 600 /opt/halo/.env
```

---

## Phase 5 — Reverse proxy with TLS (Caddy)

### 5.1 Bind internal services to localhost only

The current `docker-compose.prod.yml` exposes Postgres / Redis / MinIO on the public
internet. Change those `ports:` blocks to bind to `127.0.0.1`:

```yaml
postgres:
  ports:
    - "127.0.0.1:5432:5432"
redis:
  ports:
    - "127.0.0.1:6379:6379"
minio:
  ports:
    - "127.0.0.1:9000:9000"
    - "127.0.0.1:9001:9001"
```

API and web can keep `3000:3000` / `3001:3001` (Caddy is on the same host).

### 5.2 Add the Caddyfile

Create `/opt/halo/Caddyfile`:

```caddyfile
app.haloacquisitions.com {
    reverse_proxy web:3000
    encode zstd gzip
}

api.haloacquisitions.com {
    reverse_proxy api:3001
    encode zstd gzip
}

haloacquisitions.com {
    redir https://app.haloacquisitions.com{uri} permanent
}
```

### 5.3 Add Caddy to `docker-compose.prod.yml`

Append a service:

```yaml
caddy:
  image: caddy:2
  container_name: halo-caddy
  restart: unless-stopped
  depends_on: [api, web]
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy-data:/data
    - caddy-config:/config
```

And extend the volumes block:

```yaml
volumes:
  postgres-data:
  redis-data:
  minio-data:
  caddy-data:
  caddy-config:
```

---

## Phase 6 — DNS records (Cloudflare)

Cloudflare → haloacquisitions.com → **DNS → Records**:

| Type | Name  | Content              | Proxy             |
| ---- | ----- | -------------------- | ----------------- |
| A    | `app` | `5.78.12.34` (VPS)   | Proxied (orange)  |
| A    | `api` | `5.78.12.34`         | Proxied (orange)  |
| A    | `@`   | `5.78.12.34`         | Proxied (orange)  |

Then under **SSL/TLS**:

- **Overview → Encryption mode:** **Full (strict)**
  (Caddy issues a real cert on the origin; Cloudflare uses its own at the edge.)
- **Edge Certificates → Always Use HTTPS:** On
- **Edge Certificates → Minimum TLS Version:** 1.2

Under **Security**:

- **WAF → Managed rules:** On (free)
- **Bots → Bot Fight Mode:** On for `app.haloacquisitions.com`
- **Rules → Rate Limiting Rules** (free tier allows one):
  - Match: URI Path contains `/api/`
  - Action: 100 requests / 1 minute / per IP

---

## Phase 7 — First deploy

On the VPS:

```bash
cd /opt/halo

docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml ps
```

Run migrations:

```bash
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

Optional demo seed:

```bash
docker compose -f docker-compose.prod.yml exec api npx tsx prisma/seed.ts
```

Tail logs while smoke-testing:

```bash
docker compose -f docker-compose.prod.yml logs -f --tail=100
```

---

## Phase 8 — Smoke checks

From your laptop:

```powershell
nslookup api.haloacquisitions.com
curl https://api.haloacquisitions.com/api/health
curl -I https://app.haloacquisitions.com
```

Expected: API returns `{"status":"ok","database":{"status":"ok"},"redis":{"status":"ok"}}`.

In a browser:

- [ ] `https://app.haloacquisitions.com` loads → redirects to Descope sign-in
- [ ] Sign-in works (prod Descope project, user assigned to a tenant)
- [ ] Dashboard loads, no console errors
- [ ] `/admin` shows control plane; kill switch persists across refresh
- [ ] `/admin/api-spend` loads
- [ ] `/admin/integrations` accepts and decrypts a saved secret

---

## Phase 9 — Wire external webhooks

### Twilio

Phone Numbers → your number → Messaging:

- **A message comes in:** `POST https://api.haloacquisitions.com/api/webhooks/twilio/inbound`
- **Status callback:** `POST https://api.haloacquisitions.com/api/webhooks/twilio/status`

### DocuSign

Settings → Connect → Add Configuration:

- URL: `https://api.haloacquisitions.com/api/webhooks/docusign`
- Events: Sent, Delivered, Completed, Declined, Voided
- Enable HMAC; copy secret into `.env` as `DOCUSIGN_CONNECT_SECRET`, then:

  ```bash
  docker compose -f docker-compose.prod.yml up -d api
  ```

### SendGrid

- Verify a sender (e.g., `noreply@haloacquisitions.com`)
- Set up domain authentication (SPF + DKIM) — required for deliverability

---

## Phase 10 — Backups (do this before you have real data)

### Nightly Postgres dump

Create `/opt/halo/scripts/backup-db.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
mkdir -p /opt/halo/backups
docker compose -f /opt/halo/docker-compose.prod.yml exec -T postgres \
  pg_dump -U halo halo_prod | gzip > /opt/halo/backups/halo-$TS.sql.gz
# keep last 14 days
ls -1t /opt/halo/backups/halo-*.sql.gz | tail -n +15 | xargs -r rm
```

```bash
chmod +x /opt/halo/scripts/backup-db.sh
crontab -e
# 03:30 daily
30 3 * * * /opt/halo/scripts/backup-db.sh >> /opt/halo/backups/backup.log 2>&1
```

### Off-site copy (Cloudflare R2)

```bash
sudo apt install -y rclone
rclone config   # add remote "r2" with R2 access keys + endpoint
# then add to your cron job:
rclone copy /opt/halo/backups r2:halo-backups --max-age 7d
```

### MinIO data

If you keep MinIO local, add `/opt/halo/data/minio` to a similar rclone job — or
switch the API to R2 directly (Phase 12.2) and skip MinIO entirely.

---

## Phase 11 — Deploys after the first

**Manual / quick (good enough early):**

```bash
ssh halo@5.78.12.34
cd /opt/halo
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

**Automated (later):** add a GitHub Actions workflow on push to `main` that SSHes to
the VPS and runs the same three commands.

---

## Phase 12 — Optional cheap upgrades

Pull these in only when you outgrow the single box. None of them require code changes
beyond env vars + compose edits.

### 12.1 Move Postgres to Neon (managed, branchable)

- Create a Neon project, enable the `vector` extension under Extensions.
- Copy the pooled connection string.
- Replace `DATABASE_URL` in `/opt/halo/.env`:

  ```env
  DATABASE_URL=postgresql://<user>:<pw>@<host>/halo?sslmode=require
  ```

- In `docker-compose.prod.yml`: comment out the `postgres:` service and the
  `depends_on: postgres` blocks on api/worker.
- `docker compose up -d` then `prisma migrate deploy`.

### 12.2 Move object storage to Cloudflare R2

- Create R2 bucket `halo-documents`, generate access keys.
- Add to `.env`:

  ```env
  S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
  S3_REGION=auto
  S3_BUCKET=halo-documents
  S3_ACCESS_KEY=<r2_access_key>
  S3_SECRET_KEY=<r2_secret_key>
  ```

- Forward those into the api/worker `environment:` blocks of the compose file.
- Comment out `minio:`.

### 12.3 Move web to Vercel

- Connect the repo, set **Root Directory** to `apps/web`.
- Build command: `cd ../.. && npm install && npm run build --workspace=@halo/web`
- Env vars: `NEXT_PUBLIC_API_URL=https://api.haloacquisitions.com/api`,
  `NEXT_PUBLIC_DESCOPE_PROJECT_ID`, `NEXT_PUBLIC_DESCOPE_FLOW_ID`.
- In Cloudflare DNS, change `app` from `A → VPS IP (proxied)` to
  `CNAME → cname.vercel-dns.com (DNS-only)`.
- Remove the `web:` service from compose.

### 12.4 Replace Caddy with Cloudflare Tunnel (no inbound ports)

- Cloudflare → Zero Trust → Tunnels → Create tunnel → install `cloudflared` on the VPS.
- Map `app.haloacquisitions.com` → `http://localhost:3000`,
  `api.haloacquisitions.com` → `http://localhost:3001`.
- Close ports 80/443 on the firewall:

  ```bash
  sudo ufw delete allow 80/tcp
  sudo ufw delete allow 443/tcp
  ```

- Drop the `caddy` service from compose.

This is the most hardened cheap setup: VPS has only SSH open to the internet.

---

## Phase 13 — Monitoring (free tier)

- **Cloudflare Analytics** — traffic + WAF stats out of the box.
- **UptimeRobot** — monitor `https://api.haloacquisitions.com/api/health/live`
  every 5 minutes.
- **Sentry** (free) — drop the DSN into api/worker/web envs.
- **Healthchecks.io** (free) — ping from the nightly backup script so you're alerted
  if backups stop running.

---

## Phase 14 — Post-deploy checklist

- [ ] DNS resolves; `app.` and `api.` are HTTPS green
- [ ] `/api/health` returns `database: ok`, `redis: ok`
- [ ] Sign-in works on Descope **prod** project
- [ ] Test user is assigned to a tenant; APIs return 200 (not 403)
- [ ] Twilio + DocuSign webhooks point at prod URLs
- [ ] SendGrid sender + DKIM/SPF verified
- [ ] `/admin` kill switch and cost cap save
- [ ] `/admin/integrations` accepts and decrypts a saved secret
- [ ] Nightly backup ran at least once (check log)
- [ ] R2 / off-site backup copy verified
- [ ] `.env` is `chmod 600`, not in git
- [ ] `SECRETS_ENCRYPTION_KEY` is backed up in your password manager
- [ ] Postgres / Redis / MinIO bound to `127.0.0.1` only
- [ ] UptimeRobot monitor active
- [ ] (When ready) `FEATURE_OPENCLAW=true` and OpenClaw envs set on worker

---

## Rough monthly cost

| Item                                       | Cost            |
| ------------------------------------------ | --------------- |
| Hetzner CX22                               | ~$5             |
| Cloudflare domain (.com)                   | ~$1/mo amortized|
| Cloudflare DNS / WAF / Tunnel              | $0              |
| SendGrid / Resend free                     | $0              |
| UptimeRobot, Sentry free, Cloudflare Analytics | $0          |
| **Total**                                  | **~$6–7/mo**    |

Optional later: Neon Launch ~$19/mo, Vercel free, R2 free up to 10 GB/month.

---

## Quick reference — common ops

```bash
# tail all logs
docker compose -f docker-compose.prod.yml logs -f --tail=200

# tail one service
docker compose -f docker-compose.prod.yml logs -f api

# restart a single service after env change
docker compose -f docker-compose.prod.yml up -d api

# run a migration
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# open a shell inside the api container
docker compose -f docker-compose.prod.yml exec api sh

# Postgres shell
docker compose -f docker-compose.prod.yml exec postgres psql -U halo halo_prod
```
