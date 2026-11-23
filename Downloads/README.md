# download.judgecall.net

JudgeCall 官方下载页，使用无构建依赖的静态前端和轻量 Node.js 下载计数服务。

## 本地预览

在 `Downloads/server` 目录运行：

```powershell
$env:PORT = 4173
node index.js
```

然后访问 `http://127.0.0.1:4173/`。直接以静态服务器打开页面时，版式仍可预览，但下载计数接口不可用。

## 内容维护

- 产品介绍和下载入口：`download-config.js`
- 安装包：`files/`
- 更新日志页面：`updates/`
- 下载计数：生产环境保存在 `/var/www/download/shared/data/counts.json`

JudgeCall v2.2 APK、Rathe Dict v3.0.3 APK、Streaming Tome v1.2 beta EXE 与 Lynx Extension v1.0.1 ZIP 均已接入。

## 生产部署

- 静态站点：Nginx
- 下载计数：`server/index.js`，由 PM2 以 `download-counter` 进程运行
- Nginx 配置模板：`deploy/`
- 域名：`download.judgecall.net`

## Lynx Extension v0.4.0 发布记录（2026-09-24）

- 下载入口 `/download/lynx-extension` 由计数服务映射至 `files/Lynx v0.4.0.zip`；旧版 ZIP 保留在 `files/`，但不再作为主下载入口。
- 当前发布目录：`/var/www/download/releases/20260924T062517Z-lynx-v040`。前一版 `20260922-judgecall-v22-150350` 保留，可通过 `current` 符号链接回退；下载计数仍由 `shared/data/counts.json` 持久化。
- 公网浏览器已验证中英文文案、更新说明、390px 手机布局和实际下载；下载所得 ZIP 的 SHA-256 为 `1e9e8ae35d3c1bb015325e1332a0ebf333e365c9d2142febd7f73a3b01549b09`。
- 本次仅部署 Download 页及插件包，未部署 Lynx 网页端。

## Rathe Dict v3.0.3 发布记录（2026-10-08）

- 更新 Rathe Dict 首页中英文介绍、版本与大小；更新日志合并记录 v3.0–v3.0.3 的按需图包、在线数据与释疑更新、IAR 关联、浏览改进和缺图下载提示。
- `/updates/rathe-dict.html` 为最新中英文日志；旧 v2.0 日志保留在 `/updates/rathe-dict-v2.0.html`，旧版安装包链接仍指向 v2.0。
- `/download/rathe-dict` 保留下载计数，现跳转到 `/files/Rathe-Dict-v3.0.3.apk`。安装包为 23,948,524 字节，SHA-256：`8e18b556389d4fab72c2c3e075aea9be726e49503ef0c25a3166f75633028547`。
- 本次部署目录 `/var/www/download/releases/20261008-rathe-v303`；上一版 `/var/www/download/releases/20260924T062517Z-lynx-v040` 保留。通过 current 符号链接发布，重启 download-counter；持久化下载计数和 App 在线更新目录继续使用 shared。
- 其他产品页面和下载映射未修改。已用 Playwright 验证中英文切换、1440px 桌面及 390px 手机布局、下载跳转与 APK 哈希。

## Lynx Extension v1.0.1 发布记录（2026-11-16）

- 当前发布目录：`/var/www/download/releases/20261116-lynx-v101`，旧目录 `/var/www/download/releases/20261008-rathe-v303` 保留，可通过 `current` 符号链接回退。发布前下载计数备份：`/var/www/download/shared/backups/counts-20261116-lynx-v101.json`；服务继续使用 `shared/data/counts.json`，未清零。
- `/download/lynx-extension` 已改为下载 `files/Lynx v1.0.1.zip`。公开下载所得 ZIP 为 61,546 字节，SHA-256：`f5666d1c4f0b8e5ed7fe3f5e02be419ddf91a60c40849f10dd71f5cdcbfb9167`；ZIP 根目录的 `manifest.json` 声明版本 `1.0.1`。旧 ZIP 保留在 `files/`，不再是主下载包。
- Download 卡片与中英文更新说明已更新，记录玩家 ID 核对、Melee 双方弃权 `LOSSALL`、备用积分导出、Lynx 网页自动结算及管理端校正审计，并保留完整桌台导入提醒。
- 本地与公网均用浏览器验证中英文切换、1440px 桌面与 390px 手机布局、更新说明入口；公网首页和说明页为 200，无脚本错误或手机横向溢出。公开下载入口取得的 ZIP 哈希与本地原包一致，`download-counter` 在线。JudgeCall、Rathe Dict、Streaming Tome 的发布文件哈希与前一版相同。

### 同日 Deck Check 说明调整

- 更新说明改以 Lynx 网页的套牌检查视角为主：桌台列表、跨轮累计 DC 次数、双方均未 DC／仅一方有 DC／无限制三种随机抽桌候选池筛选、双方最低积分门槛、随机抽选结果高亮、逐玩家检查与判罚／备注／补时。明确 DC 是 Deck Check 而非 Drop，筛选不会隐藏桌台列表，插件与网页功能的归属也分别标明。
- 发布目录：`/var/www/download/releases/20261116-lynx-v101-deck-notes`；前一版 `20261116-lynx-v101` 保留可回退。下载计数备份：`/var/www/download/shared/backups/counts-20261116-lynx-deck-notes.json`。只更改说明文案，公开插件 ZIP 仍为同一 v1.0.1 文件，SHA-256 未变。
- 本地与公网 Chrome 验证：中英文内容、下载按钮指向、1440px 桌面和 390px 手机页面均正常；公网说明页与 ZIP 返回 200，无脚本错误或横向溢出，`download-counter` 在线。
