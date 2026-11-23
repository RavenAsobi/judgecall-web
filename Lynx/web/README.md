# Lynx Web 前端

由 `demo.html` 拆分而来的多人在线联机版前端。当前线上页面以 `lynx-beta.source.html` 为唯一构建入口。

## 技术栈

- Vite + 原生 JS 模块（无框架）
- 原生 WebSocket 客户端
- CSS 在原有基础上维护桌台、移动端与状态提示

## 目录结构

```
web/
├── lynx-beta.source.html # 当前 Beta 页面源文件
├── index.html            # 历史页面；开发服务器的 / 已指向 Beta 页面
├── package.json
├── vite.config.js        # 含 /api、/ws 代理到 localhost:3000
└── src/
    ├── main.js           # 入口：路由、导航、pins、把函数挂到 window
    ├── style.css         # demo 完整 CSS
    ├── state.js          # 共享状态 + 工具函数
    ├── api.js            # REST 封装（/api/*）
    ├── ws.js             # WebSocket 封装（逐桌更新、确认、房间与计时器）
    └── pages/
        ├── login.js      # 界面1：登录
        ├── admin.js      # 界面2：管理后台
        ├── tournaments.js# 界面3：赛事列表
        └── detail.js     # 界面4：比赛详情（桌子/计时器/筛选/分块/旋转/导入/设置）
```

## 启动开发服务器

```bash
cd web
npm install
npm run dev
```

默认监听 `http://localhost:5173`。`/api` 与 `/ws` 已通过 vite proxy 转发到 `http://localhost:3000`。

## 构建

```bash
npm run build
```

产物输出到 `web/dist/lynx-beta.html` 和 `web/dist/assets/`；还会生成 `web/lynx-beta.html` 单文件版本。在线版必须连接后端 `/api` 与 `/ws`。

## 后端对接

- REST 基础路径：`/api`（开发环境代理到 `http://localhost:3000`）
- WebSocket：`/ws`（开发环境代理到 `ws://localhost:3000/ws`）
- 协议约定见 `src/ws.js` 顶部注释与 `src/api.js` 各函数注释

## 2026-09-24 赛事压力测试后的行为

- 普通导入中，空成绩桌保留现有颜色、成绩与巡场状态；双 Drop 桌标绿。
- 新一轮代码头可触发桌数同步；桌号缺漏会被拒绝，缩减桌数须确认。
- 逐桌更新携带桌台版本，服务端确认前页面显示“正在保存”并锁住后续写操作。
- “开始下一轮”由服务端一次提交桌台、轮数、计时与回报状态。
- 焦点桌由管理权限标记，裁判端无法操作；显示姓名和搜索只影响当前视图。
