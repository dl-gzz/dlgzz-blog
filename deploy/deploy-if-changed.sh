#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/dlgzz/app}"
cd "$APP_DIR"

for attempt in $(seq 1 3); do
  if git -c http.version=HTTP/1.1 fetch --quiet origin main; then
    break
  fi
  if [ "$attempt" -eq 3 ]; then
    echo "Unable to check GitHub for updates after 3 attempts." >&2
    exit 1
  fi
  sleep $((attempt * 3))
done
LOCAL_REVISION="$(git rev-parse HEAD)"
REMOTE_REVISION="$(git rev-parse origin/main)"

if [ "$LOCAL_REVISION" = "$REMOTE_REVISION" ] && \
   sudo docker compose --env-file /opt/dlgzz/shared/app.env \
     --env-file /opt/dlgzz/shared/app.env.local \
     -f deploy/docker-compose.prod.yml ps --status running --quiet app | grep -q .; then
  exit 0
fi

exec "$APP_DIR/deploy/deploy.sh"
