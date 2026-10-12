#!/usr/bin/env bash
# Nightly backup (docs/deployment-runbook.md, section 4).
#
#   scripts/deploy/backup.sh            # database dump + documents bucket
#   scripts/deploy/backup.sh --db-only  # database dump only (used by deploy.sh)
#
# Writes $BACKUP_DIR/<label>/ with halo.dump (pg_dump custom format) and
# documents/ (the S3 bucket mirrored), prunes folders older than
# BACKUP_KEEP_DAYS, and copies the folder to BACKUP_S3_URI when set.
# The dump is unreadable without the PII_* keys from .env: back that file
# up separately.
set -euo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
ENV_FILE="${ENV_FILE:-.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

DB_ONLY=0
[ "${1:-}" = "--db-only" ] && DB_ONLY=1

BACKUP_DIR="${BACKUP_DIR:-/var/backups/halo}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
LABEL="${BACKUP_LABEL:-$(date +%Y-%m-%d)}"
DEST="$BACKUP_DIR/$LABEL"
mkdir -p "$DEST"

say() { printf '\033[1;34m==>\033[0m %s\n' "$*"; }

say "Database -> $DEST/halo.dump"
"${COMPOSE[@]}" exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-halo}" -d "${POSTGRES_DB:-halo_prod}" -Fc --no-owner \
  > "$DEST/halo.dump.partial"
mv "$DEST/halo.dump.partial" "$DEST/halo.dump"

if [ "$DB_ONLY" = "0" ]; then
  say "Documents bucket -> $DEST/documents/"
  # The RustFS data volume holds the bucket as plain files; mirror it from a
  # throwaway container so no S3 client is needed on the host.
  mkdir -p "$DEST/documents"
  volume="$(docker volume ls -q --filter label=com.docker.compose.volume=minio-data | head -1)"
  if [ -n "$volume" ]; then
    docker run --rm \
      -v "$volume:/data:ro" \
      -v "$DEST/documents:/backup" \
      alpine:3 sh -c 'cp -a /data/. /backup/ 2>/dev/null || true'
  else
    echo "WARN minio-data volume not found; documents were not backed up" >&2
  fi
fi

printf 'commit=%s\ncreated=%s\n' "$(git rev-parse --short HEAD 2>/dev/null || echo unknown)" "$(date -Is)" > "$DEST/manifest.txt"
chmod -R go-rwx "$DEST"

say "Pruning backups older than $KEEP_DAYS days"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -mtime "+$KEEP_DAYS" -exec rm -rf {} + 2>/dev/null || true

if [ -n "${BACKUP_S3_URI:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    say "Copying to $BACKUP_S3_URI/$LABEL"
    aws s3 sync "$DEST" "$BACKUP_S3_URI/$LABEL" --only-show-errors
  else
    echo "WARN BACKUP_S3_URI is set but the aws CLI is not installed; backup stayed local" >&2
  fi
fi

say "Backup complete: $DEST ($(du -sh "$DEST" | cut -f1))"
