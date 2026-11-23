# Lynx 联机版 · 插件对接建议

> 配套文档：[`protocol.md`](./protocol.md)（插件导出协议详解）
> 前提：联机版前端复用 `demo.html` 的 `applyImport()` 逻辑，UI 与功能保持不变。

---

## 1. 当前手动粘贴流程（保留作为兜底）

```
用户在 GEM/melee 页面点插件按钮
   → 插件写剪贴板
   → 用户切到 Lynx 网页
   → 打开导入弹窗
   → Ctrl+V 粘贴
   → 点「导入」
   → applyImport() 解析入库
```

**优点**
- 插件与后端**零耦合**，后端改 API、加鉴权、换域名都不影响插件。
- 用户可在粘贴后**肉眼检查** JSON 再确认，避免脏数据直接落库。
- 实现成本为零（demo 已经能用）。

**缺点**
- 操作步骤多（切页 → 开弹窗 → 粘贴 → 点确认），裁判长时间操作易烦。
- 容易粘错轮次、粘错比赛（用户可能把 A 比赛的数据粘到 B 比赛的弹窗里）。
- 无法做服务端校验（例如「这桌号在当前比赛里不存在」只能前端兜底）。

**结论**：**联机版首版必须保留这条路径**作为兜底，即使后续做了自动化。

---

## 2. 未来可选的自动化方案

按改造成本从低到高排列，**推荐方案 A**。

### 方案 A：插件直接 POST 到 Lynx 后端（推荐）

**思路**：插件抓取完成后，除了写剪贴板，**同时**弹出一个确认框让用户选「直接上传到当前比赛」。用户确认后，插件把 JSON `POST` 到 Lynx 后端。

#### 数据流

```
GEM/melee 页面
   ↓ DOM 解析
插件 popup
   ↓ 用户点「上传到 Lynx」
   ↓ 用户选择/确认比赛 ID（或自动从 URL 推断）
POST https://lynx.example.com/api/tournaments/{id}/import
   Authorization: Bearer <token>
   Content-Type: application/json
   Body: <插件当前抓到的 matches 数组>
   ↓
后端做权限校验 + 桌号校验 + 写库 + WebSocket 广播
   ↓
该比赛所有在线客户端实时刷新
```

#### 需要插件配合改造的点

| 改造点 | 工作量 | 说明 |
|---|---|---|
| 1. 增加「上传到 Lynx」按钮 | 小 | popup UI 加一个按钮，与「复制到剪贴板」并列 |
| 2. 增加设置页 | 中 | 让用户配置 Lynx 服务地址（`https://lynx.example.com`）和个人 token |
| 3. 增加登录/鉴权 | 中 | 复用 manifest 已有的 `cookies` 权限：让用户先在浏览器里登录 Lynx 网页，插件读 cookie 调 API；或让用户粘 token |
| 4. 增加比赛选择器 | 中 | 调 `GET /api/tournaments?active=true` 拉当前用户可导入的比赛列表，下拉选 |
| 5. host_permissions 加 Lynx 域名 | 极小 | manifest 加一条 `*://*.lynx.example.com/*`（或用户自建域名） |
| 6. 错误处理与重试 | 小 | 网络失败时降级到「已复制到剪贴板，请手动粘贴」 |

#### 后端需要新增的接口

| 接口 | 方法 | 说明 |
|---|---|---|
| `/api/tournaments?active=true` | GET | 列出当前用户可导入的比赛（用于插件下拉选） |
| `/api/tournaments/{id}/import` | POST | 接收 matches 数组，复用现有 `applyImport` 的标准化逻辑（搬到服务端） |
| `/api/auth/extension-token` | POST | （可选）用网页 session 换一个长期 token 给插件用 |

#### 服务端要做的校验（不能全信插件）

- 桌号范围是否在该比赛的 `startTable` ~ `maxTable` 内
- 用户是否有该比赛的 `event` 级及以上权限
- 是否新一轮（无 result 无 timeExt）→ 触发轮数 +1 与刷白逻辑
- 写入后通过 WebSocket 广播 `tables:updated` 事件

---

### 方案 B：插件 + 网页端 postMessage 通信（中等成本）

**思路**：用户同时开着 GEM/melee 页和 Lynx 页。插件在抓取后，通过 `chrome.tabs.sendMessage` 把数据推送给 Lynx 页签，Lynx 页内的 content script 接收后自动填入导入弹窗。

**优点**：不用配 token，不用选比赛（默认填到当前打开的 Lynx 页）。
**缺点**：要求两页同开；跨 tab 通信要处理 tab 发现、消息路由；用户可能开了多个 Lynx 页签。

**适用场景**：如果坚持不上后端 API，可以走这条。但既然联机版本来就有后端，**不如直接走方案 A**。

---

### 方案 C：浏览器原生「共享剪贴板」+ 网页轮询（不推荐）

**思路**：插件写剪贴板后，Lynx 网页通过 `navigator.clipboard.readText()` 定时轮询，发现新数据自动弹导入确认。

**缺点**：浏览器对 `clipboard.readText` 权限管控严格（需要用户手势 + 持续授权），体验差，**不推荐**。

---

## 3. 推荐落地路径

| 阶段 | 内容 | 插件是否要改 |
|---|---|---|
| **MVP（联机版首版）** | 保留手动粘贴流程，前端 `applyImport()` 原样搬到 web/ 工程，后端只接收表单提交 | **不改** |
| **V1.1** | 后端新增 `/api/tournaments/{id}/import` 接口（即使插件还没改，网页端「粘贴导入」也可以走这个接口而不是纯前端解析） | **不改** |
| **V1.2** | 插件加「上传到 Lynx」按钮 + 设置页 + 比赛选择器 | **改**（工作量约 1-2 天） |
| **V2** | 考虑英雄数据也走 API（当前 `extractGemHeroes` 只写剪贴板） | 改 |

---

## 4. 给插件开发者的改造清单（如果决定做方案 A）

按优先级排序：

1. **必做**：manifest `host_permissions` 增加 Lynx 后端域名
2. **必做**：popup 增加「上传」按钮，与「复制」并列
3. **必做**：新增设置页（service worker 或 options page），存 `lynxBaseUrl` 与 `authToken`
4. **必做**：上传前调 `GET /api/tournaments?active=true` 让用户选比赛
5. **建议**：上传成功后 toast 显示「已上传到 {比赛名} 第 N 桌」
6. **建议**：上传失败自动 fallback 到「已复制到剪贴板」
7. **可选**：复用 background 已有的 `TOURNAMENT_NAMES` 存储，根据当前 GEM URL 的 `gemId` 自动预选比赛（如果后端能把 `gemId` 与 Lynx 比赛 ID 关联）
8. **可选**：增加「自动上传」开关，抓取完成后不弹确认直接 POST（适合熟练裁判）

---

## 5. 风险与注意事项

| 风险 | 缓解 |
|---|---|
| 插件 token 泄露 | token 仅走 `chrome.storage.local`，不上云；提供「注销」按钮 |
| 用户上传错比赛 | 上传前二次确认 + 显示比赛名/轮次/桌数摘要 |
| 后端 API 变更 | 在响应里加 `protocolVersion`，插件做兼容判断 |
| 多人同时上传同一桌 | 服务端做乐观锁（`updatedAt` 比对），冲突时返回 409 让插件提示 |
| 用户离线 | 上传失败 fallback 到剪贴板，提示「已复制，请联网后手动粘贴」 |

---

## 6. 总结

- **短期（MVP）**：插件**完全不用改**，手动粘贴路径已经够用。
- **中期**：后端先出 `/import` API，前端粘贴导入也走这个 API，统一入口。
- **长期**：插件加「上传」按钮，体验从「切页 + 粘贴 + 确认」压缩到「点一下」。

**核心原则**：**剪贴板路径永远保留**作为兜底，自动化路径只做增量、不做替换。
