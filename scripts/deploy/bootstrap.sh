#!/usr/bin/env bash
# First-time server setup for Hālo (docs/deployment-runbook.md, section 1).
#
#   cp .env.prod.example .env
#   scripts/deploy/bootstrap.sh
#
# Installs Docker when missing, generates the secrets that must be random,
# and lists the values you still have to provide. Idempotent: run it again
# any time; it never overwrites a value that is already set.
set -euo pipefail

cd "$(dirname "$0")/../.."
ENV_FILE="${ENV_FILE:-.env}"

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARN\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found. Start with: cp .env.prod.example $ENV_FILE"

# ---- Docker -----------------------------------------------------------------
if ! command -v docker >/dev/null 2>&1; then
  say "Installing Docker (official convenience script)"
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker "$USER" || true
  warn "Log out and back in so your user picks up the docker group, then rerun this script."
  exit 0
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (docker compose version)."

# ---- Generated secrets -------------------------------------------------------
# Only fills a key that is present and empty; a missing key is appended.
set_if_empty() {
  local key="$1" value="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    local current
    current="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
    if [ -z "$current" ]; then
      sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
      say "Generated ${key}"
    fi
  else
    printf '%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    say "Generated ${key}"
  fi
}
hex32() { openssl rand -hex 32; }
pw()    { openssl rand -base64 32 | tr -d '/+=' | cut -c1-32; }

set_if_empty POSTGRES_PASSWORD "$(pw)"
set_if_empty REDIS_PASSWORD "$(pw)"
set_if_empty MINIO_ROOT_PASSWORD "$(pw)"
set_if_empty SECRETS_ENCRYPTION_KEY "$(hex32)"
set_if_empty PII_ENCRYPTION_KEY_V1 "$(hex32)"
set_if_empty PII_INDEX_KEY "$(hex32)"
set_if_empty INTERNAL_API_TOKEN "$(hex32)"
chmod 600 "$ENV_FILE"

# ---- Values only you can provide --------------------------------------------
missing=()
for key in DESCOPE_PROJECT_ID PUBLIC_API_URL NEXT_PUBLIC_API_URL CORS_ORIGINS EMAIL_FROM MESSAGING_HELP_CONTACT; do
  value="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
  if [ -z "$value" ] || printf '%s' "$value" | grep -q 'example.com'; then
    missing+=("$key")
  fi
done
if grep -q 'haloacquisitions.com' Caddyfile && ! grep -q 'haloacquisitions.com' "$ENV_FILE"; then
  warn "Caddyfile still names haloacquisitions.com; replace all three hostnames with your domain."
fi

# ---- Backup directory ---------------------------------------------------------
backup_dir="$(grep -E '^BACKUP_DIR=' "$ENV_FILE" | cut -d= -f2- || true)"
backup_dir="${backup_dir:-/var/backups/halo}"
if [ ! -d "$backup_dir" ]; then
  sudo mkdir -p "$backup_dir" && sudo chown "$USER" "$backup_dir" && say "Created $backup_dir"
fi

say "Secrets are in $ENV_FILE (mode 600). Copy PII_ENCRYPTION_KEY_V1, PII_INDEX_KEY and SECRETS_ENCRYPTION_KEY to your password manager now."
if [ "${#missing[@]}" -gt 0 ]; then
  warn "Still to fill in $ENV_FILE: ${missing[*]}"
  warn "Then run: scripts/deploy/deploy.sh"
  exit 2
fi
say "Ready. Next: scripts/deploy/deploy.sh"
