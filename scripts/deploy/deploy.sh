#!/usr/bin/env bash
# Build, migrate, start, verify (docs/deployment-runbook.md, sections 1-2, 6).
#
#   scripts/deploy/deploy.sh                # full deploy of the checked-out commit
#   scripts/deploy/deploy.sh --no-migrate   # rollback to an older commit without touching the schema
#   scripts/deploy/deploy.sh --no-backup    # skip the pre-deploy database backup
#
# Stops before starting new app containers when a migration fails, so the
# previous version keeps serving.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
ENV_FILE="${ENV_FILE:-.env}"
MIGRATE=1
BACKUP="${BACKUP_BEFORE_DEPLOY:-1}"
for arg in "$@"; do
  case "$arg" in
    --no-migrate) MIGRATE=0 ;;
    --no-backup) BACKUP=0 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 64 ;;
  esac
done

say()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE not found; run scripts/deploy/bootstrap.sh first"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a
: "${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is empty; run scripts/deploy/bootstrap.sh}"
: "${DESCOPE_PROJECT_ID:?DESCOPE_PROJECT_ID is empty}"

say "Deploying $(git rev-parse --short HEAD) ($(git log -1 --pretty=%s | cut -c1-60))"

say "Building images"
"${COMPOSE[@]}" build --pull api web worker

say "Starting data services"
"${COMPOSE[@]}" up -d postgres redis minio
for svc in postgres redis minio; do
  for _ in $(seq 1 30); do
    status="$("${COMPOSE[@]}" ps --format '{{.Health}}' "$svc" 2>/dev/null || true)"
    [ "$status" = "healthy" ] && break
    sleep 2
  done
  [ "$status" = "healthy" ] || die "$svc did not become healthy"
done

if [ "$BACKUP" = "1" ] && "${COMPOSE[@]}" ps --status running --format '{{.Service}}' | grep -qx api; then
  say "Pre-deploy backup"
  BACKUP_LABEL="pre-deploy-$(date +%Y%m%d-%H%M%S)" scripts/deploy/backup.sh --db-only
fi

if [ "$MIGRATE" = "1" ]; then
  say "Running migrations"
  if ! "${COMPOSE[@]}" run --rm migrate; then
    die "Migration failed; the previous containers are still running. See docs/deployment-runbook.md section 3."
  fi
else
  say "Skipping migrations (--no-migrate)"
fi

say "Starting api, worker, web, caddy"
"${COMPOSE[@]}" up -d --remove-orphans api worker web caddy

say "Waiting for the api"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T api wget -q -O- http://localhost:3001/api/health/live >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
"${COMPOSE[@]}" exec -T api wget -q -O- http://localhost:3001/api/health/live >/dev/null 2>&1 || {
  "${COMPOSE[@]}" logs --tail=80 api
  die "api did not come up"
}

say "Pruning old images"
docker image prune -f >/dev/null || true

say "Smoke checks"
scripts/deploy/smoke.sh || die "Smoke checks failed; the stack is up but something is wrong. See the output above."

say "Deployed $(git rev-parse --short HEAD)"
"${COMPOSE[@]}" ps
