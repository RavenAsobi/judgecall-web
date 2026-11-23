# Lynx 部署入口

当前生产部署采用以下结构：

```text
/var/www/lynx/
├── current -> releases/<时间戳>/
├── releases/
├── shared/
│   ├── .env
│   ├── data/lynx.db
│   └── backups/
└── uploads/
```

- 中国大陆、备案完成前：按 [`private-before-icp.md`](private-before-icp.md) 操作，只允许通过 SSH 隧道访问。
- 发布脚本：`scripts/deploy-release.sh <source-directory>`。
- 私有 Nginx：`scripts/nginx-private.conf`。
- 备案完成后的公开 Nginx：`scripts/nginx-public-after-icp.conf`。
- 备份和恢复：参见 [`backup.md`](backup.md)。
- 安全检查：参见 [`security.md`](security.md)。

旧的“在工作目录执行 `git reset --hard` 再覆盖运行目录”流程已经停用。新版发布先在独立版本目录完成依赖安装和前端构建，再原子切换 `current`，旧版本保留用于人工回滚。
