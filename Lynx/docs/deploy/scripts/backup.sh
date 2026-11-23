#!/usr/bin/env bash
# Lynx SQLite 备份脚本
# 用 sqlite3 .backup 做在线一致性备份，gzip 压缩，按保留策略清理旧备份
# cron 建议：30 3 * * * /var/www/lynx/current/docs/deploy/scripts/backup.sh >> /var/www/lynx/shared/backups/backup.log 2>&1

set -euo pipefail

# ---------- 配置 ----------
DB_PATH="/var/www/lynx/shared/data/lynx.db"
BACKUP_DIR="/var/www/lynx/shared/backups"
DAILY_KEEP_DAYS=30       # 日备份保留天数
MONTHLY_KEEP_DAYS=365    # 月备份（每月1号）保留天数
# --------------------------

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lynx-$TIMESTAMP.db"

log() { echo "[backup $(date '+%F %T')] $*"; }

if [[ ! -f "$DB_PATH" ]]; then
    log "ERROR: 数据库不存在 $DB_PATH"
    exit 1
fi

mkdir -p "$BACKUP_DIR"

log "开始备份 $DB_PATH -> $BACKUP_FILE"
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

log "压缩备份"
gzip "$BACKUP_FILE"

# 校验备份完整性
log "校验备份完整性"
TMP_DB=$(mktemp)
trap 'rm -f "$TMP_DB"' EXIT
gunzip -c "$BACKUP_FILE.gz" > "$TMP_DB"
if ! sqlite3 "$TMP_DB" "PRAGMA integrity_check;" | grep -qx ok; then
    log "ERROR: 备份文件完整性校验失败，删除 $BACKUP_FILE.gz"
    rm -f "$BACKUP_FILE.gz"
    exit 1
fi
rm -f "$TMP_DB"
trap - EXIT

log "清理旧备份"
# 删除 30 天前的日备份，但保留每月 1 号的（文件名形如 lynx-YYYYMM01-*）
find "$BACKUP_DIR" -name 'lynx-*.db.gz' -mtime "+$DAILY_KEEP_DAYS" ! -name 'lynx-??????01-*.db.gz' -delete
# 删除 365 天前的月备份
find "$BACKUP_DIR" -name 'lynx-??????01-*.db.gz' -mtime "+$MONTHLY_KEEP_DAYS" -delete

log "完成 $BACKUP_FILE.gz ($(du -h "$BACKUP_FILE.gz" | cut -f1))"
