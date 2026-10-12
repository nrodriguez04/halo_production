#!/usr/bin/env bash
# Post-deploy smoke checks (docs/deployment-runbook.md, section 7).
#
#   scripts/deploy/smoke.sh
#
# Reads PUBLIC_API_URL / CORS_ORIGINS from .env to find the public
# hostnames. Every check prints PASS or FAIL; exits non-zero on any FAIL.
set -uo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
ENV_FILE="${ENV_FILE:-.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }

API="${PUBLIC_API_URL:-}"; API="${API%/}"
APP="${CORS_ORIGINS%%,*}"
fails=0
pass() { printf 'PASS  %s\n' "$*"; }
fail() { printf 'FAIL  %s\n' "$*"; fails=$((fails + 1)); }
code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@" 2>/dev/null || echo 000; }

# Inside the compose network first: these work before DNS and TLS do.
if "${COMPOSE[@]}" exec -T api wget -q -O- http://localhost:3001/api/health/live >/dev/null 2>&1; then
  pass "api liveness (container)"
else
  fail "api liveness (container)"
fi
ready="$("${COMPOSE[@]}" exec -T api wget -q -O- http://localhost:3001/api/health/ready 2>/dev/null || true)"
# /health/ready returns one entry per dependency ({database:{status},redis:{status},...}).
if [ -n "$ready" ] && ! printf '%s' "$ready" | grep -q '"status":"error"' && printf '%s' "$ready" | grep -q '"status":"ok"'; then
  pass "api readiness (every dependency check ok)"
else
  fail "api readiness: ${ready:-no response}"
fi
if "${COMPOSE[@]}" exec -T worker wget -q -O- http://localhost:3003/ >/dev/null 2>&1; then
  pass "worker health port"
else
  fail "worker health port"
fi

# Through Caddy, when the public hostnames are configured.
if [ -n "$API" ] && ! printf '%s' "$API" | grep -q 'example.com'; then
  c="$(code "$API/health/live")"; [ "$c" = "200" ] && pass "public api health ($c)" || fail "public api health ($c)"
  c="$(code "$API/internal/health")"; [ "$c" = "404" ] && pass "internal routes hidden at the edge ($c)" || fail "internal routes reachable at the edge ($c); check Caddyfile"
  c="$(code -X POST "$API/webhooks/twilio/inbound" --data 'From=%2B15555550100&Body=hi')"; [ "$c" = "403" ] && pass "twilio webhook rejects unsigned posts ($c)" || fail "twilio webhook unsigned post returned $c"
  c="$(code -X POST "$API/webhooks/docusign" -H 'content-type: application/json' --data '{}')"; [ "$c" = "403" ] && pass "docusign webhook rejects unsigned posts ($c)" || fail "docusign webhook unsigned post returned $c"
  c="$(code "$API/leads")"; [ "$c" = "401" ] && pass "api requires auth ($c)" || fail "unauthenticated /leads returned $c"
else
  echo "SKIP  public checks (PUBLIC_API_URL not set to a real domain)"
fi
if [ -n "$APP" ] && ! printf '%s' "$APP" | grep -q 'example.com'; then
  c="$(code "$APP/")"; [ "$c" = "200" ] && pass "web responds ($c)" || fail "web returned $c"
fi

if [ "$fails" -eq 0 ]; then
  echo "All smoke checks passed."
else
  echo "$fails smoke check(s) failed." >&2
  exit 1
fi
