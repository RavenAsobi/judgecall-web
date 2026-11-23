# Lynx 生产安全基线

## 网络

- Node 只监听 `127.0.0.1:3000`。
- 备案前 Nginx 只监听 `127.0.0.1:8080`，仅经 SSH 隧道访问。
- 备案完成后安全组只公开 80/443；3000 和 8080 始终不公开。
- SSH 只允许管理员固定公网 IP，修改规则时保留当前连接并用第二个会话验证。

## 密码与会话

- `SUPER_PASSWORD_HASH` 必须是 bcrypt 哈希；生产环境缺失时服务拒绝启动。
- 使用 `cd server && npm run hash-password` 交互式生成，不在命令行参数、源码或日志里写明文密码。
- 浏览器登录后只保存 256 位随机会话 token，不保存权限密码。
- SQLite 只保存 token 的 SHA-256 摘要；会话默认 72 小时过期，注销后立即失效。
- 每次会话使用都会重新检查普通权限、单场权限和赛事是否仍然有效。
- `.env` 权限设为 `600`，放在 `/var/www/lynx/shared/.env`。

## HTTP 与 WebSocket

- Helmet 提供 CSP、`X-Frame-Options: DENY`、`nosniff` 等安全头。
- 前端沿用内联 `onclick` 属性，因此 CSP 仅对 `script-src-attr` 放行内联事件；内联 `<script>` 和外站脚本仍被禁止。
- CORS 只允许同源或 `CORS_ORIGINS` 中的精确来源。
- 登录、赛事密码验证和一般 API 分别限流。
- WebSocket 校验 Origin 和会话，限制消息大小与频率，并使用 ping/pong 清理失联连接。

## 数据与运行

- SQLite 数据库位于 `/var/www/lynx/shared/data/lynx.db`，不随版本目录切换。
- PM2 固定单实例，避免 SQLite 写入竞争和内存 WebSocket 房间分裂。
- 定期备份数据库并实际演练恢复；恢复前必须停止应用写入。
- 发布脚本保留旧版本用于代码回滚，但数据库回滚必须使用独立备份。

## 上线前检查

```bash
pm2 status
curl http://127.0.0.1:3000/api/health
curl -I http://127.0.0.1:8080/
sudo nginx -t
ss -lntp
```

确认 Node 只绑定 `127.0.0.1:3000`，备案前 Nginx 只绑定 `127.0.0.1:8080`，且安全组未开放 80/443/3000/8080。
