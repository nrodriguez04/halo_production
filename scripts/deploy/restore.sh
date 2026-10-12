#!/usr/bin/env bash
# Restore a backup made by scripts/deploy/backup.sh (docs/deployment-runbook.md, section 4).
#
#   scripts/deploy/restore.sh /var/backups/halo/2026-10-12
#
# Stops api and worker, replaces the database with the dump, mirrors the
# documents bucket back when the backup has one, restarts, runs the smoke
# checks. The .env in use must carry the same PII_* keys as the one that
# wrote the backup, or every phone and email comes back unreadable.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
ENV_FILE="${ENV_FILE:-.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

SRC="${1:-}"
[ -n "$SRC" ] && [ -f "$SRC/halo.dump" ] || { echo "usage: $0 <backup folder containing halo.dump>" >&2; exit 64; }

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
DB_USER="${POSTGRES_USER:-halo}"
DB_NAME="${POSTGRES_DB:-halo_prod}"

printf 'This replaces database %s and the documents bucket with %s. Type RESTORE to continue: ' "$DB_NAME" "$SRC"
read -r answer
[ "$answer" = "RESTORE" ] || { echo "aborted"; exit 1; }

say "Stopping api and worker"
"${COMPOSE[@]}" stop api worker >/dev/null

say "Restoring database"
"${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\";" \
  -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";" >/dev/null
"${COMPOSE[@]}" exec -T postgres pg_restore -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges < "$SRC/halo.dump"

if [ -d "$SRC/documents" ]; then
  say "Restoring documents bucket"
  volume="$(docker volume ls -q --filter label=com.docker.compose.volume=minio-data | head -1)"
  [ -n "$volume" ] || { echo "ERROR could not find the minio-data volume" >&2; exit 1; }
  "${COMPOSE[@]}" stop minio >/dev/null
  docker run --rm -v "$volume:/data" -v "$SRC/documents:/backup:ro" alpine:3 \
    sh -c 'rm -rf /data/* && cp -a /backup/. /data/'
  "${COMPOSE[@]}" start minio >/dev/null
fi

say "Starting api and worker"
"${COMPOSE[@]}" start api worker >/dev/null
sleep 10
scripts/deploy/smoke.sh
say "Restore complete from $SRC"
