#!/usr/bin/env bash
# Downtime and recovery alerts from the server itself (docs/deployment-runbook.md, section 5).
#
#   */5 * * * * cd /opt/halo && scripts/deploy/healthwatch.sh 2>&1 | logger -t halo-healthwatch
#
# Checks the api (liveness and readiness), the worker and the web app every
# run, and posts to ALERT_WEBHOOK_URL from .env only when the state changes:
# one alert when something goes down, one when it recovers. An on-box check
# cannot report a dead box, so pair it with an external uptime monitor on
# https://api.<domain>/api/health/live.
set -uo pipefail

cd "$(dirname "$0")/../.."
COMPOSE=(docker compose -f docker-compose.prod.yml)
ENV_FILE="${ENV_FILE:-.env}"
# shellcheck disable=SC1090
[ -f "$ENV_FILE" ] && { set -a; . "$ENV_FILE"; set +a; }
STATE_FILE="${HEALTHWATCH_STATE:-/var/tmp/halo-healthwatch.state}"

problems=()
# /health/live reports the database and Redis. /health/ready needs a signed-in
# session, so an anonymous call to it would always look like a failure.
live="$("${COMPOSE[@]}" exec -T api wget -q -O- http://localhost:3001/api/health/live 2>/dev/null || true)"
if [ -z "$live" ]; then
  problems+=("api is not answering")
elif ! printf '%s' "$live" | grep -q '"database":{"status":"ok"}' || ! printf '%s' "$live" | grep -q '"redis":{"status":"ok"}'; then
  problems+=("api dependencies failing: $(printf '%s' "$live" | head -c 300)")
fi
"${COMPOSE[@]}" exec -T worker wget -q -O- http://localhost:3003/ >/dev/null 2>&1 || problems+=("worker is not answering")
# 127.0.0.1, not localhost: in the Alpine image localhost resolves to ::1 first.
"${COMPOSE[@]}" exec -T web wget -q -O- http://127.0.0.1:3000/ >/dev/null 2>&1 || problems+=("web is not answering")

if [ "${#problems[@]}" -eq 0 ]; then current="ok"; else current="down"; fi
previous="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
printf '%s\n' "$current" > "$STATE_FILE"

host="$(printf '%s' "${PUBLIC_API_URL:-$(hostname)}" | sed -E 's#^https?://##; s#/.*$##')"
notify() {
  local text="$1"
  echo "$text"
  if [ -n "${ALERT_WEBHOOK_URL:-}" ]; then
    payload="$(python3 -c 'import json,sys; t=sys.argv[1]; print(json.dumps({"text": t, "content": t}))' "$text" 2>/dev/null \
      || printf '{"text":"%s","content":"%s"}' "${text//\"/\'}" "${text//\"/\'}")"
    curl -s -m 10 -H 'Content-Type: application/json' -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || echo "alert webhook unreachable" >&2
  fi
}

if [ "$current" = "down" ] && [ "$previous" != "down" ]; then
  notify "[CRITICAL] Halo ($host) is degraded: $(IFS='; '; echo "${problems[*]}")"
elif [ "$current" = "ok" ] && [ "$previous" = "down" ]; then
  notify "[info] Halo ($host) recovered: api, worker and web are answering again"
elif [ "$current" = "down" ]; then
  echo "still degraded: ${problems[*]}"
fi
exit 0
