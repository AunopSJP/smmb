#!/usr/bin/env bash
# SMMB deploy — build frontend/backend, publish, restart, verify, rollback on failure
#
# ใช้บนเซิร์ฟเวอร์ (รันจาก repo ที่ pull แล้ว):
#   sudo -u smmb bash scripts/deploy.sh
#   sudo -u smmb bash scripts/deploy.sh --pull --migrate
#
# ตัวแปรที่ปรับได้:
#   APP_DIR=/opt/smmb  WEB_ROOT=/var/www/smmb  SERVICE=smmb-backend
#   HEALTH_URL=http://127.0.0.1:3000/api/health  HEALTH_TIMEOUT=45
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/smmb}"
WEB_ROOT="${WEB_ROOT:-/var/www/smmb}"
SERVICE="${SERVICE:-smmb-backend}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-45}"
BACKUP="${BACKUP:-$APP_DIR/dist.prev}"
PULL=0
MIGRATE=0

for arg in "$@"; do
  case "$arg" in
    --pull) PULL=1 ;;
    --migrate) MIGRATE=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

cd "$APP_DIR"
log() { printf '\n==> %s\n' "$*"; }

if [ "$PULL" = 1 ]; then
  log "git pull --ff-only"
  git pull --ff-only
fi

log "install + build frontend"
npm --prefix frontend ci
npm --prefix frontend run build:hub

log "install + build backend"
npm --prefix backend ci
npm --prefix backend run build
if [ "$MIGRATE" = 1 ]; then
  log "run migrations"
  npm --prefix backend run migrate:prod
fi

DIST_INDEX="frontend/dist/smmb-web/browser/index.html"
DIST_MAIN="$(grep -oE 'main-[A-Z0-9]+\.js' "$DIST_INDEX" | head -n1)"
if [ -z "$DIST_MAIN" ]; then
  echo "cannot find main-*.js in $DIST_INDEX" >&2
  exit 1
fi
log "built asset: $DIST_MAIN"

rollback() {
  if [ -d "$BACKUP" ]; then
    log "ROLLBACK web to previous release"
    rsync -a --delete "$BACKUP/" "$WEB_ROOT/"
    systemctl reload nginx || true
  fi
}

# เก็บ release ก่อนหน้าไว้ 1 ชุด
if [ -d "$WEB_ROOT" ]; then
  log "backup current web root -> $BACKUP"
  rm -rf "$BACKUP"
  mkdir -p "$BACKUP"
  rsync -a "$WEB_ROOT/" "$BACKUP/"
fi

log "publish frontend -> $WEB_ROOT"
rsync -a --delete frontend/dist/smmb-web/browser/ "$WEB_ROOT/"

SERVED_MAIN="$(grep -oE 'main-[A-Z0-9]+\.js' "$WEB_ROOT/index.html" | head -n1 || true)"
if [ "$SERVED_MAIN" != "$DIST_MAIN" ]; then
  echo "deployed hash mismatch: served=$SERVED_MAIN dist=$DIST_MAIN" >&2
  rollback
  exit 1
fi
log "web hash verified: $SERVED_MAIN"

log "restart $SERVICE"
systemctl restart "$SERVICE"

log "wait for $HEALTH_URL"
for i in $(seq 1 "$HEALTH_TIMEOUT"); do
  if curl -fsS --max-time 3 "$HEALTH_URL" | grep -q '"status":"ok"'; then
    log "health OK after ${i}s"
    log "deploy complete: $DIST_MAIN"
    exit 0
  fi
  sleep 1
done

echo "health check failed after ${HEALTH_TIMEOUT}s" >&2
rollback
systemctl restart "$SERVICE" || true
exit 1
