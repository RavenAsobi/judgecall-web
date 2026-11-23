#!/usr/bin/env bash
# Lynx 备份恢复脚本
# 用法：./restore.sh /var/www/lynx/backups/lynx-20260725-033000.db.gz
# 会停服务 → 备份当前库 → 恢复 → 校验 → 重启

set -euo pipefail

# ---------- 配置 ----------
DB_PATH="/var/www/lynx/data/lynx.db"
PM2_APP="lynx"
# --------------------------

if [[ $# -ne 1 ]]; then
    echo "用法: $0 <备份文件.db.gz 或 .db>"
    exit 1
fi

BACKUP_FILE="$1"

if [[ ! -f "$BACKUP_FILE" ]]; then
    echo "ERROR: 备份文件不存在 $BACKUP_FILE"
    exit 1
fi

log() { echo "[restore $(date '+%F %T')] $*"; }

log "停止服务 $PM2_APP"
pm2 stop "$PM2_APP" || true

log "备份当前数据库到 $DB_PATH.before-restore"
if [[ -f "$DB_PATH" ]]; then
    sqlite3 "$DB_PATH" ".backup '$DB_PATH.before-restore'"
fi

TMP_DB=$(mktemp)
trap 'rm -f "$TMP_DB"' EXIT

log "解压/读取备份"
if [[ "$BACKUP_FILE" == *.gz ]]; then
    gunzip -c "$BACKUP_FILE" > "$TMP_DB"
else
    cp "$BACKUP_FILE" "$TMP_DB"
fi

log "校验备份完整性"
if ! sqlite3 "$TMP_DB" "PRAGMA integrity_check;" | grep -q ok; then
    echo "ERROR: 备份文件损坏，中止恢复。当前数据库未动。"
    pm2 start "$PM2_APP" || pm2 restart "$PM2_APP"
    exit 1
fi

log "替换数据库"
cp "$TMP_DB" "$DB_PATH"
chmod 640 "$DB_PATH"

log "重启服务"
pm2 restart "$PM2_APP"

log "完成。请登录后台验证数据。原数据库备份在 $DB_PATH.before-restore"
