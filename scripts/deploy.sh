#!/usr/bin/env bash
# SureWina production deploy. Run as root on the app server:
#
#   bash /opt/surewina/scripts/deploy.sh
#
# Order: backup -> pull -> install -> migrate (as the migrator) -> generate ->
# build -> restart -> health check. If anything before the restart fails,
# the running services are left alone and the previous build is put back,
# so a failed deploy never takes the site down.
#
# Migrations must stay additive (new tables, new nullable columns), so the
# running code keeps working if a later step fails.

set -euo pipefail

APP_DIR=/opt/surewina
MIGRATOR_ENV=/root/surewina-secrets/migrator.env
BACKUP_DIR=/root/backups
PREV_BUILD=/root/surewina-previous-build
SERVICES=(surewina-api surewina-worker surewina-engine surewina-customer surewina-agent surewina-admin)
BUILT_DIRS=(apps/api/dist apps/engine/dist apps/worker/dist apps/web-admin/.next apps/web-agent/.next apps/web-customer/.next)

step() { printf '\n==> %s\n' "$1"; }
fail() { printf '\nDEPLOY STOPPED: %s\n' "$1" >&2; exit 1; }

restore_previous_build() {
  printf '\nPutting the previous build back. Services were not restarted.\n' >&2
  for d in "${BUILT_DIRS[@]}"; do
    if [ -d "$PREV_BUILD/$d" ]; then
      rm -rf "${APP_DIR:?}/$d"
      mkdir -p "$(dirname "$APP_DIR/$d")"
      cp -a "$PREV_BUILD/$d" "$APP_DIR/$d"
    fi
  done
}

cd "$APP_DIR"
git config --global --get-all safe.directory | grep -qx "$APP_DIR" || git config --global --add safe.directory "$APP_DIR"

step "1/8 Back up the database"
[ -f "$MIGRATOR_ENV" ] || fail "missing $MIGRATOR_ENV"
set -a; . "$MIGRATOR_ENV"; set +a
[ -n "${DATABASE_URL:-}" ] || fail "DATABASE_URL not set in $MIGRATOR_ENV"
mkdir -p "$BACKUP_DIR"
BACKUP="$BACKUP_DIR/surewina-$(date +%F-%H%M%S).dump"
pg_dump "${DATABASE_URL%%\?*}" -Fc -f "$BACKUP"
[ -s "$BACKUP" ] || fail "backup is empty"
ls -lh "$BACKUP"

step "2/8 Pull the code"
BEFORE=$(git rev-parse --short HEAD)
git pull --ff-only origin main
AFTER=$(git rev-parse --short HEAD)
git log --oneline -1
[ "$BEFORE" != "$AFTER" ] || echo "(already up to date: $AFTER)"

step "3/8 Install packages"
pnpm install --frozen-lockfile

step "4/8 Save the running build"
rm -rf "$PREV_BUILD"
for d in "${BUILT_DIRS[@]}"; do
  if [ -d "$d" ]; then mkdir -p "$PREV_BUILD/$(dirname "$d")"; cp -a "$d" "$PREV_BUILD/$d"; fi
done

trap 'restore_previous_build; fail "a step failed (see above). Database backup: $BACKUP"' ERR

step "5/8 Migrate the database (as the migrator)"
( cd apps/api && npx prisma migrate deploy )
( cd apps/api && npx prisma migrate status )

step "6/8 Generate the database client"
( cd apps/api && npx prisma generate )

step "7/8 Build everything"
pnpm turbo run build --force

trap - ERR

step "8/8 Restart all six services and check them"
systemctl restart "${SERVICES[@]}"
sleep 25
bad=0
for s in "${SERVICES[@]}"; do
  state=$(systemctl is-active "$s" || true)
  restarts=$(systemctl show "$s" -p NRestarts --value)
  printf '%-20s %-8s restarts since start: %s\n' "$s" "$state" "$restarts"
  if [ "$state" != "active" ] || [ "${restarts:-0}" -gt 0 ]; then bad=1; fi
done
if [ -x /usr/local/sbin/surewina-healthcheck ]; then
  /usr/local/sbin/surewina-healthcheck && echo "health check: OK" || bad=1
fi
journalctl -u surewina-api -u surewina-engine -u surewina-worker --since "-1 min" --no-pager \
  | grep -iE "error|exception|fatal" | grep -viE "monnify daily transaction reconciliation" | head -20 || true

if [ "$bad" -ne 0 ]; then
  fail "a service is not healthy after restart. Previous build is in $PREV_BUILD; database backup: $BACKUP"
fi

printf '\nDEPLOYED %s -> %s. Database backup: %s\n' "$BEFORE" "$AFTER" "$BACKUP"
