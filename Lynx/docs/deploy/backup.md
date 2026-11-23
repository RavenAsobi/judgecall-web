# 备份策略

> SQLite 单文件数据库，备份 = 安全地拷贝 `lynx.db`。
> 关键风险：直接 `cp` 一个正在被写入的 SQLite 文件可能得到损坏的副本，必须用 SQLite 的在线备份机制。

## 一、备份原则

| 项 | 策略 |
|---|---|
| 备份对象 | `/var/www/lynx/data/lynx.db` |
| 备份方式 | `sqlite3 .backup` 命令（在线、一致性） |
| 频率 | 每日 1 次（凌晨 3:30，业务低峰） |
| 保留策略 | 保留最近 30 天 + 每月 1 号保留 12 个月 |
| 存储位置 | 本机 `/var/www/lynx/backups/` + 异地（可选，rsync 到对象存储/另一台机器） |
| 加密 | 备份文件含权限密码哈希等敏感数据，异地传输必须加密 |

## 二、为什么用 `sqlite3 .backup` 而不是 `cp`

- `cp` 在数据库有活跃写入时会拷贝到一半状态，文件可能损坏。
- `sqlite3 lynx.db ".backup 'target.db'"` 使用 SQLite 的 Online Backup API，保证一致性，且不阻塞读写。
- 如果后端用了 WAL 模式，`.backup` 会自动处理 `-wal` 和 `-shm` 文件。

## 三、备份脚本

见 `scripts/backup.sh`。核心逻辑：

```bash
#!/usr/bin/env bash
set -euo pipefail

DB_PATH="/var/www/lynx/data/lynx.db"
BACKUP_DIR="/var/www/lynx/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/lynx-$TIMESTAMP.db"

mkdir -p "$BACKUP_DIR"

# 在线备份（一致性）
sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

# 压缩以省空间
gzip "$BACKUP_FILE"

# 保留策略：删 30 天前的日备份，但保留每月 1 号的
find "$BACKUP_DIR" -name 'lynx-*.db.gz' -mtime +30 ! -name 'lynx-*01-*.db.gz' -delete
# 删 12 个月前的月备份
find "$BACKUP_DIR" -name 'lynx-*01-*.db.gz' -mtime +365 -delete

echo "[backup] $BACKUP_FILE.gz done"
```

## 四、cron 配置

```bash
crontab -e
```

加一行：

```cron
30 3 * * * /var/www/lynx/scripts/backup.sh >> /var/log/lynx-backup.log 2>&1
```

## 五、恢复流程

见 `scripts/restore.sh`。步骤：

1. **停服务**（避免恢复期间写入）：
   ```bash
   pm2 stop lynx
   ```

2. **备份当前库**（防止恢复错）：
   ```bash
   sqlite3 /var/www/lynx/data/lynx.db ".backup '/var/www/lynx/data/lynx.db.before-restore'"
   ```

3. **解压并替换**：
   ```bash
   gunzip -k /var/www/lynx/backups/lynx-20260725-033000.db.gz
   cp /var/www/lynx/backups/lynx-20260725-033000.db /var/www/lynx/data/lynx.db
   ```

4. **校验完整性**：
   ```bash
   sqlite3 /var/www/lynx/data/lynx.db "PRAGMA integrity_check;"
   # 应输出 ok
   ```

5. **重启服务**：
   ```bash
   pm2 restart lynx
   ```

6. **验证**：登录后台，检查比赛列表、密码列表是否符合预期。

## 六、异地备份（可选但强烈建议）

国内云厂商对象存储（OSS / COS / S3）或另一台服务器：

```bash
# 例：用 rclone 同步到对象存储（需先配置 rclone）
rclone sync /var/www/lynx/backups/ remote:lynx-backups/ --encrypt
```

加密原因：备份文件包含所有权限密码哈希、用户名缓存等敏感数据。

## 七、备份监控

- 每天检查 `/var/log/lynx-backup.log` 是否有 `done` 字样。
- 每周抽查一个备份文件，跑 `PRAGMA integrity_check;` 确认可用。
- 每月做一次恢复演练（在测试环境）。
