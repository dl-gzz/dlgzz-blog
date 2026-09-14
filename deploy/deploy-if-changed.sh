#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/dlgzz/app}"
cd "$APP_DIR"

git fetch --quiet origin main
LOCAL_REVISION="$(git rev-parse HEAD)"
REMOTE_REVISION="$(git rev-parse origin/main)"

if [ "$LOCAL_REVISION" = "$REMOTE_REVISION" ] && \
   sudo docker compose -f deploy/docker-compose.prod.yml ps --status running --quiet app | grep -q .; then
  exit 0
fi

exec "$APP_DIR/deploy/deploy.sh"

