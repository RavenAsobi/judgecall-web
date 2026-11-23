# Lynx Server

Lynx 的 Node.js 后端使用 Express、WebSocket 和 SQLite。生产模式下同时托管 `web/dist`，根路径直接返回 Beta 页面。

## 启动

```bash
cd server
npm ci
npm start
```

- REST API：`http://127.0.0.1:3000/api/*`
- WebSocket：`ws://127.0.0.1:3000/ws`
- 健康检查：`GET /api/health`
- 数据库路径由 `DB_PATH` 配置；默认是 `server/lynx.db`

生产环境必须配置 `SUPER_PASSWORD_HASH`，否则服务会拒绝启动。交互式生成：

```bash
npm run hash-password
```

## 认证与会话

登录：

```http
POST /api/auth/login
Content-Type: application/json

{"name":"管理员","password":"<权限密码>"}
```

成功返回：

```json
{"token":"<随机会话 token>","role":"super","eventTournamentId":null}
```

后续 REST 请求使用：

```http
X-Session-Token: <登录返回的 token>
X-User-Name: <encodeURIComponent(用户名)>
```

浏览器只保存随机会话 token，不保存权限密码。数据库只保存 token 的 SHA-256 摘要；会话默认 72 小时过期，并在每次使用时重新检查权限是否仍有效。

常用认证接口：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 密码换取随机会话 token |
| GET | `/api/auth/session` | 恢复并验证当前会话 |
| POST | `/api/auth/logout` | 注销当前会话 |
| POST | `/api/tournaments/:id/verify` | 使用会话、免密缓存或赛事密码进入比赛 |

## 权限

| 角色 | 说明 |
|---|---|
| `super` | 原始权限；密码以 bcrypt 哈希保存在环境变量中 |
| `putong` | 普通权限；由 `super` 发放，有自定义有效期 |
| `event` | 单场赛事权限；只管理对应比赛 |
| `judge` | 游客；进入赛事后只能执行允许的桌面操作 |

所有受保护的 REST 和 WebSocket 操作都由服务端鉴权。WebSocket 加入房间时发送：

```json
{"type":"join","tournamentId":1720000000000,"name":"小李","token":"<会话 token>"}
```

服务端还会检查来源、消息频率、消息大小和心跳状态。

## 桌台同步协议（2026-09-24）

- `table:update`：单桌提交 `{opId, baseRevision, table}`。桌台版本不匹配时拒绝，并返回最新快照；普通裁判不能修改焦点桌。
- `table:ack` / `table:updated`：分别确认发送者与广播其他设备，包含服务器保存的桌台和赛事状态版本。
- `tables:patch`：仅管理权限可执行的批量替换，必须提交 `patch.stateRevision`；旧版本网页发送的无版本全量覆盖会被拒绝。
- `round:start`：管理权限提交 `mode: "manual" | "import"`、`stateRevision`、`opId`；服务端在 SQLite 事务中更新桌台、轮数、计时和回报，返回 `round:ack`。
- `operation:rejected`：返回失败原因和最新桌台快照，客户端用它恢复显示。断线重连也会重新拉取快照。

数据库启动时自动补充 `manualOnly`、`stateRevision`、桌台 `revision`、`focus` 与 `resultSource` 列。正式发布前先对共享数据库做 SQLite 在线备份；新旧页面混用时，旧页面需要刷新才能继续修改桌台。

## 生产运行约束

- 应用只监听 `127.0.0.1:3000`，由 Nginx 反向代理。
- PM2 必须保持单实例；SQLite 和内存 WebSocket 房间不支持横向多开。
- `CORS_ORIGINS` 只填写明确允许的跨域来源；同源请求自动允许。
- `.env` 和数据库放在 `/var/www/lynx/shared`，不要放进版本目录。
- 生产部署详见 `docs/deploy/private-before-icp.md`。
