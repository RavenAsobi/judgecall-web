# Lynx 部署架构

> 目标环境：Linux 服务器（Ubuntu 22.04 LTS 为基准），国内访问。
> 当前阶段：**仅出方案，不实际部署**。本地联调通过后再上云。

## 一、总体架构

```
                        ┌─────────────────────────────────────┐
                        │           Linux Server              │
                        │                                     │
   Browser / Extension  │   ┌─────────┐      ┌─────────────┐  │
   ───── HTTPS/WS ─────►│   │  Nginx  │─────►│  Node.js    │  │
        (80 / 443)      │   │ (反向代理│      │  Express    │  │
                        │   │  443)   │      │  + ws       │  │
                        │   └────┬────┘      │  :3000      │  │
                        │        │           └──────┬──────┘  │
                        │        │ 静态文件          │         │
                        │        ▼                  ▼         │
                        │   /var/www/lynx/      lynx.db       │
                        │   dist/  (前端构建产物)  (SQLite)    │
                        │                                     │
                        │   PM2 守护 Node 进程                │
                        │   cron 定时备份 lynx.db             │
                        └─────────────────────────────────────┘
```

## 二、组件职责

| 组件 | 版本建议 | 职责 |
|---|---|---|
| Nginx | ≥ 1.18 | 反向代理、静态文件托管、HTTPS 终结、WebSocket Upgrade |
| Node.js | ≥ 18 LTS | 运行后端 Express + ws |
| PM2 | latest | Node 进程守护、开机自启、日志管理 |
| SQLite | ≥ 3.35 | 单文件数据库 `lynx.db` |
| Certbot | latest | Let's Encrypt 证书签发与续期 |

## 三、请求路由

Nginx 监听 80 / 443，按路径分发：

| 路径 | 去向 | 说明 |
|---|---|---|
| `/` | `/var/www/lynx/dist/` | 前端静态文件（Vite 构建产物） |
| `/api/*` | `http://127.0.0.1:3000` | 后端 REST API |
| `/ws` | `http://127.0.0.1:3000` | WebSocket 长连接，需 `Upgrade` 头 |
| `/.well-known/acme-challenge/` | 本地目录 | Let's Encrypt 验证 |

> 后端只监听 `127.0.0.1:3000`，不直接暴露公网，所有流量经 Nginx。

## 四、WebSocket 代理要点

WebSocket 握手依赖 HTTP `Upgrade` 头，Nginx 默认会丢弃，必须显式配置：

```nginx
location /ws {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # 长连接超时（默认 60s 太短，比赛期间会断）
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

完整配置见 `scripts/nginx-public-after-icp.conf`。

## 五、进程守护（PM2）

后端用 PM2 托管，实现：

- 崩溃自动重启
- 开机自启（`pm2 startup` + `pm2 save`）
- 统一日志（`~/.pm2/logs/`）
- 零停机 reload（`pm2 reload lynx`）

`ecosystem.config.js` 示例：

```js
module.exports = {
  apps: [{
    name: 'lynx',
    script: './server/index.js',
    cwd: '/var/www/lynx',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      DB_PATH: '/var/www/lynx/data/lynx.db',
    },
    instances: 1,        // SQLite 单文件，单实例即可，多实例会有锁冲突
    exec_mode: 'fork',
    max_memory_restart: '500M',
  }],
};
```

> **注意**：SQLite 单文件 + `ws` 内存态广播，**必须单实例**（`instances: 1`），不能用 cluster 模式。

## 六、HTTPS（Let's Encrypt）

- 用 Certbot 申请免费证书，自动续期（`certbot --nginx`）。
- 80 端口强制跳转 443。
- WebSocket 走 `wss://`（浏览器对 https 页面里的 `ws://` 会拦截）。
- 证书路径：`/etc/letsencrypt/live/<domain>/`。

## 七、目录规划

```
/var/www/lynx/
├── dist/              # 前端构建产物（Nginx 直接托管）
├── server/            # 后端代码
│   └── index.js
├── data/
│   └── lynx.db        # SQLite 数据库（独立目录，便于备份/权限隔离）
├── backups/           # 备份文件（cron 写入）
├── ecosystem.config.js
└── .env               # 环境变量（权限密码哈希等，chmod 600）
```

## 八、数据流

1. 浏览器访问 `https://lynx.judgecall.net/` → Nginx 返回 `dist/lynx-beta.html`。
2. 前端 JS 发起 `/api/...` 请求 → Nginx 反代到 `127.0.0.1:3000` → Express 处理 → 读写 `lynx.db`。
3. 前端建立 `wss://lynx.judgecall.net/ws` → Nginx Upgrade → 后端 `ws` 服务 → 比赛状态广播。
4. 每日凌晨 cron 调 `backup.sh` → 拷贝 `lynx.db` 到 `backups/lynx-YYYYMMDD-HHMMSS.db` → 清理 30 天前的备份。
