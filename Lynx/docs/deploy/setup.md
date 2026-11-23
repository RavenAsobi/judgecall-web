# Ubuntu 环境准备

Lynx 当前以 Ubuntu、Node.js 22 LTS、Nginx、PM2 单实例和 SQLite 运行。

中国大陆服务器在备案完成前，不按公网域名直接上线。请直接执行：

- [`private-before-icp.md`](private-before-icp.md)：备案前私有部署、SSH 隧道访问、更新和回滚。
- [`deploy.md`](deploy.md)：部署文件与目录入口。
- [`security.md`](security.md)：生产安全基线。
- [`backup.md`](backup.md)：数据库备份与恢复。

最低运行组件：

```bash
node --version
npm --version
nginx -v
pm2 --version
sqlite3 --version
rsync --version
```

要求：

- Node.js 22 LTS。
- Node 和私有 Nginx 都只绑定回环地址。
- `/var/www/lynx/shared` 独立保存 `.env`、数据库和备份。
- PM2 只运行一个 Lynx 实例。
- 备案完成、页面加入真实备案号并签发 HTTPS 证书后，才启用公网配置。
