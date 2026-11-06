#!/usr/bin/env bash
# How much can someone with no account spend, and what stops them?
#
#   ./run.sh
#
# Needs Docker and Node 22. The backend is destroyed and rebuilt every run.
set -uo pipefail
cd "$(dirname "$0")"

# Fail here rather than three minutes from now with an empty result.
docker info >/dev/null 2>&1 || {
  echo ""
  echo "  Docker is not running. Start Docker Desktop (or your daemon) and run this again."
  echo ""
  exit 1
}

up() {
  docker compose "$@" up -d >/dev/null 2>&1
  for _ in $(seq 1 120); do
    code=$(curl -s -o /dev/null -w '%{http_code}' -H 'X-Parse-Application-Id: spend' \
      'http://127.0.0.1:1344/parse/classes/Usage?limit=0')
    [ "$code" != 000 ] && return          # answering at all is what "up" means
    sleep 0.5
  done
  echo "    !! the backend never answered — stopping rather than reporting zeros" >&2
  docker compose logs parse 2>&1 | tail -5 >&2
  exit 1
}

docker compose down -v >/dev/null 2>&1
up

echo ""
echo "  [1/3] THE BACKEND AS IT ARRIVES — NO LIMIT ANYWHERE"
node run.mjs open

echo "  [2/3] WITH THE SERVER'S OWN RATE LIMIT ON"
docker compose down >/dev/null 2>&1
up -f compose.yml -f compose.ratelimit.yml
node run.mjs limited

echo "  [3/3] WITH A PER-PERSON DAILY CAP IN THE FUNCTION"
docker compose down >/dev/null 2>&1
DAILY_CAP=10 up
node run.mjs capped
