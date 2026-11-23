#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <source-directory>"
  exit 2
fi

APP_ROOT="/var/www/lynx"
SOURCE_DIR="$(realpath "$1")"
RELEASE_ID="$(date +%Y%m%d-%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"

if [[ ! -f "$SOURCE_DIR/server/package-lock.json" || ! -f "$SOURCE_DIR/web/package-lock.json" ]]; then
  echo "Source directory is not a complete Lynx project"
  exit 1
fi

mkdir -p "$APP_ROOT/releases" "$APP_ROOT/shared/data" "$APP_ROOT/shared/backups"
mkdir "$RELEASE_DIR"
rsync -a \
  --exclude node_modules \
  --exclude .npm-cache \
  --exclude .env \
  --exclude 'server/lynx.db*' \
  "$SOURCE_DIR/" "$RELEASE_DIR/"

cd "$RELEASE_DIR/web"
npm ci
npm run build

cd "$RELEASE_DIR/server"
npm ci --omit=dev

ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"

cd "$APP_ROOT/current"
if pm2 describe lynx >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo "Released $RELEASE_DIR"
echo "Old releases were retained for manual rollback."

