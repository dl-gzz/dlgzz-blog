#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/dlgzz/app}"
COMPOSE_FILE="$APP_DIR/deploy/docker-compose.prod.yml"
ENV_FILE="${ENV_FILE:-/opt/dlgzz/shared/app.env}"
LOCAL_ENV_FILE="${LOCAL_ENV_FILE:-/opt/dlgzz/shared/app.env.local}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health/build}"
LOCK_FILE="${LOCK_FILE:-/opt/dlgzz/deploy.lock}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another deployment is already running."
  exit 0
fi

cd "$APP_DIR"

fetch_main() {
  local attempt
  for attempt in $(seq 1 5); do
    if timeout 90s git \
      -c http.version=HTTP/1.1 \
      -c http.lowSpeedLimit=1024 \
      -c http.lowSpeedTime=30 \
      fetch --prune origin main; then
      return 0
    fi
    if [ "$attempt" -lt 5 ]; then
      echo "GitHub fetch failed (attempt $attempt/5); retrying shortly." >&2
      sleep $((attempt * 3))
    fi
  done
  echo "Unable to fetch origin/main after 5 attempts." >&2
  return 1
}

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to deploy over local changes in $APP_DIR."
  exit 1
fi

if [ "${SKIP_FETCH:-0}" != "1" ]; then
  fetch_main
fi
git checkout main
git merge --ff-only origin/main

export GIT_COMMIT_SHA="$(git rev-parse HEAD)"
export GIT_BRANCH="$(git branch --show-current)"

COMPOSE=(sudo env "GIT_COMMIT_SHA=$GIT_COMMIT_SHA" "GIT_BRANCH=$GIT_BRANCH" docker compose --env-file "$ENV_FILE")
if [ -f "$LOCAL_ENV_FILE" ]; then
  COMPOSE+=(--env-file "$LOCAL_ENV_FILE")
fi
COMPOSE+=(-f "$COMPOSE_FILE")

"${COMPOSE[@]}" build --pull app
"${COMPOSE[@]}" up -d --remove-orphans app

for attempt in $(seq 1 24); do
  if curl --fail --silent --show-error --max-time 5 "$HEALTH_URL" | \
    python3 -c 'import json,sys; data=json.load(sys.stdin); sys.exit(0 if data.get("success") and data.get("commit") == sys.argv[1] else 1)' "$GIT_COMMIT_SHA"; then
    echo
    echo "Deployment healthy at $(git rev-parse --short HEAD)."
    exit 0
  fi
  sleep 5
done

echo "Deployment did not become healthy in time." >&2
"${COMPOSE[@]}" ps >&2
"${COMPOSE[@]}" logs --tail=120 app >&2
exit 1
