# Lynx 浏览器插件对接协议

> 2026-09-24 更新：下文主要记录早期插件分析。当前 Lynx Beta 还支持 v0.3.0 数组首项新一轮代码头与 `p1Wins` / `p2Wins` / `draws`。普通导入的空成绩桌保留原桌态；双方 Drop 时标绿。合法新一轮代码头在自动模式下同步桌数、重置计时并增加轮数；“仅手动开始下一轮”模式不会自动开轮。具体实现以 `web/src/pages/detail.js` 与 `web/src/import-utils.js` 为准。

> 分析对象：`F:\搬家\lynx\extension\dist\`（已构建产物，Manifest V3，Vue 3 单文件 popup）
> 前端消费方：`F:\搬家\lynx\demo.html` 的 `applyImport()`（约 2513 行起）
> 本文档只描述协议与数据流，**不修改插件**。

---

## 1. 插件基本信息

| 项 | 值 |
|---|---|
| name | `Lynx` |
| version | `0.2.0`（7-26 新增 EventLink 支持） |
| manifest_version | 3 |
| 描述 | 从 GEM、melee.gg 和 EventLink 提取 TCG 赛事数据，导入 Lynx 平台 |
| 入口 popup | `src/popup/index.html`（挂载 `assets/index.html-*.js`） |
| background | `service-worker-loader.js` + `assets/background.ts-*.js` |
| permissions | `activeTab`, `scripting`, `webNavigation`, `storage`, `cookies` |
| host_permissions | `*://*.gem.fabtcg.com/*`、`*://*.lorcana-api.com/*`、`*://*.melee.gg/*`、`*://eventlink.wizards.com/*` |

> **源码工程**：`F:\搬家\lynx\extension\`（Vue3 + CRXJS + Vite5，`npm install` 后 `npm run build` 构建，产物在 `extension/dist/`）。7-26 从 `F:\搬家\cpf\拓展\` 复制进项目内，旧位置不再更新。

> 注意：manifest 里声明了 `lorcana-api.com`，但当前 popup 代码并未实际调用该域名，应为预留（Lorcana 也是 FAB 系，可能后续走 GEM 同源 API）。

---

## 2. 插件工作流程

### 2.1 平台识别（popup 内）

popup 加载后通过 `chrome.tabs.query({active:true})` 拿当前 tab URL，按前缀识别平台：

```js
if (url.startsWith("https://gem.fabtcg.com/gem/")) return "gem";
if (url.includes("melee.gg"))                       return "melee";
if (url.includes("eventlink.wizards.com"))          return "eventlink"; // 0.2.0 新增
return null;
```

UI 根据识别结果决定显示哪些按钮：

| 平台 | URL 条件 | 可用按钮 |
|---|---|---|
| GEM | `/gem/{id}/run`（结尾允许带 `/`） | **提取英雄数据** |
| GEM | URL 含 `/report` | **提取比赛结果** |
| melee.gg | 任意 melee.gg 页面 | **提取比赛结果** |
| EventLink | 任意 eventlink.wizards.com 页面 | **提取比赛结果**（找不到配对表时提示不写剪贴板） |

### 2.2 数据抓取方式

**全部走 DOM 解析**，通过 `chrome.scripting.executeScript({ func })` 把函数注入到目标页面执行，**不调用任何后端 API**。

三个注入函数（位于 popup 的 `index.html-*.js` 内）：

| 函数 | 触发按钮 | 目标页 | 抓取对象 |
|---|---|---|---|
| `extractGemHeroesInline()` | 提取英雄数据 | GEM `/gem/{id}/run` | `ol li div.row` 下的选手姓名/ID/英雄 |
| `extractGemResultsInline()` | 提取比赛结果 | GEM `/gem/{id}/report` | `.match-row` 行 + `#refresh ul li` 上报列表 |
| `extractMeleeResultsInline()` | 提取比赛结果 | melee.gg 配对表 | `#tournament-player-pairings-table tbody tr` |
| `extractEventlinkResultsInline()` | 提取比赛结果 | eventlink 配对/成绩页 | `table.pairings-table tbody tr`（0.2.0 新增，参考实现 `src/content/eventlink.ts`） |

**EventLink 抓取要点**：胜负不看比分大小，看 `.box-score` 的 `winner/loser` 类标位置——`[winner,loser]→1WIN`、`[loser,winner]→2WIN`、`[winner,winner]→DRAW`（用户确认：0:0 和 1:1 双 winner 都是已回报平局）、**无 winner/loser 类且内容为 `_`_（下划线占位）→ `null` 未回报**；比分可以是 2:x 也可以是单局 1:0/0:1，判定规则不变。drop 判定 = `.team__text` 类含 `dropped`；战绩 `.team__record` 为"胜–负–平"（en-dash），不进入导出协议。已经两份真实样本 DOM 实测（`lynx/tools/test-eventlink-dom.html`，输出样本 `lynx/tools/eventlink-sample-output.json`）。

### 2.3 后台 service worker 行为

`background.ts-*.js` 只做一件事：监听 `chrome.webNavigation.onCompleted`，当 URL 命中 `gem.fabtcg.com/gem/{id}/run` 时，注入脚本读取页面 `h1` 文本（赛事名），存入 `chrome.storage.local` 的 `TOURNAMENT_NAMES` 字典（`{ gemId: name }`）。

> 当前 popup 代码**未消费**这个存储。属于预留能力，未来可用于在 popup 显示当前赛事名。

### 2.4 数据落地

抓取完成后，结果通过 `navigator.clipboard.writeText(JSON.stringify(data, null, 2))` **写入系统剪贴板**，并 toast 提示「已复制到剪贴板」。**插件不直接发任何网络请求把数据送到 Lynx**。

---

## 3. 导出 JSON 格式规范

### 3.1 比赛结果（GEM / melee 通用结构）

最外层是**数组**，每个元素一桌：

```json
[
  {
    "game": "fab",
    "tableNumber": 1,
    "playerName1": "张三",
    "playerGameId1": "12345",
    "playerName2": "李四",
    "playerGameId2": "67890",
    "result": "1WIN",
    "dropped1": false,
    "dropped2": false,
    "timeExtension": null
  }
]
```

#### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `game` | string | 是 | `"fab"`（GEM 来源）或 `"mtg"`（melee 来源）。**前端 `applyImport` 不读这个字段**，仅作来源标记 |
| `tableNumber` | number | 是 | 桌号，整数 |
| `playerName1` | string \| null | 是 | 玩家 1 姓名（GEM 从 `名字 (ID)` 正则切出；melee 取 `a.open-player-card-link` 文本） |
| `playerGameId1` | string \| null | 否 | 玩家 1 在源平台的 ID。**前端不消费** |
| `playerName2` | string \| null | 是 | 玩家 2 姓名。BYE 时 melee 侧可能为 `null` |
| `playerGameId2` | string \| null | 否 | 玩家 2 在源平台的 ID。**前端不消费** |
| `result` | string \| null | 是 | 见下方枚举 |
| `dropped1` | boolean | 是 | 玩家 1 是否退赛 |
| `dropped2` | boolean | 是 | 玩家 2 是否退赛 |
| `timeExtension` | string \| null | 仅 melee | 加时分钟数（字符串，来自输入框 `value`）。GEM 抓取时**不写这个字段** |

#### `result` 枚举

| 值 | 含义 | 来源 |
|---|---|---|
| `"1WIN"` | 玩家 1 胜 | GEM / melee |
| `"2WIN"` | 玩家 2 胜 | GEM / melee |
| `"DRAW"` | 平局 | 仅 GEM（melee 抓取逻辑里没产生 DRAW 的分支） |
| `"LOSSALL"` | 双负 | 仅 GEM（来自 GEM 的 "Double Loss" 选项） |
| `"BYE"` | 轮空 | 仅 melee（结果文本含「轮空」） |
| `null` | 未回报 / 双方上报不一致 | GEM / melee |

#### GEM 侧的额外约定

GEM 抓取函数会扫描 `#refresh ul li` 的「上报不一致」列表：若 P1 与 P2 各自上报的成绩不一致且都不是 `None`，则该桌 `result` 强制写 `null`，并在 popup toast 中提示「N 条结果存在上报不一致」。

### 3.2 英雄数据（仅 GEM）

```json
[
  { "game": "fab", "name": "张三", "gameId": "12345", "hero": "Kano, Dracai of Aether" }
]
```

| 字段 | 说明 |
|---|---|
| `game` | 固定 `"fab"` |
| `name` | 选手姓名 |
| `gameId` | GEM 平台 ID |
| `hero` | 英雄名 |

> 该格式由 `extractGemHeroesInline()` 产生，**与 `applyImport()` 无关**，是另一条独立数据通道（demo 中可能有专门的英雄导入入口）。

---

## 4. 与前端 `applyImport()` 的字段映射

`demo.html` 的 `applyImport()` 在 2530-2541 行做标准化，映射关系如下：

| 插件导出字段 | 前端标准化字段 | 转换规则 |
|---|---|---|
| `tableNumber` | `tableNumber` | `parseInt`，NaN 则报错 |
| `playerName1` | `p1` | 原值，空转 `null` |
| `playerName2` | `p2` | 原值，空转 `null` |
| `result` | `result` | 原值，空转 `null` |
| `dropped1` | `dropped1` | `!!value` 强制布尔 |
| `dropped2` | `dropped2` | `!!value` 强制布尔 |
| `timeExtension` | `timeExt` | `parseInt` 或 `0`；`null`/`undefined` 转 `null` |
| `game` | — | **被忽略** |
| `playerGameId1/2` | — | **被忽略** |

### 4.1 结果值到内部的二次映射

`applyImport()` 在 2572-2584 行根据当前比赛游戏类型（`currentTournament.game`）做二次映射：

| 插件 `result` | FAB 内部 `t.result` | MTG 内部 `t.result` |
|---|---|---|
| `"1WIN"` 或 `"BYE"` | `'p1'` | `{p1:2, p2:0, draws:0}` |
| `"2WIN"` | `'p2'` | `{p1:0, p2:2, draws:0}` |
| `"DRAW"` / `"LOSSALL"` | `'draw'` | `{p1:1, p2:1, draws:0}` |
| `null` | `null` | `null` |

> 注意：`BYE` 被当作 P1 胜处理；`LOSSALL` 被当作 draw 处理。这是前端既定行为，插件无需调整。

### 4.2 颜色与状态规则（前端实现，插件无需关心）

| 条件 | 颜色 |
|---|---|
| `timeExt > 0` | 红 |
| 否则有成绩 | 绿 |
| 否则 | 白 |

**起始桌号校验**：导入数据的最小 `tableNumber` 必须等于 `currentTournament.startTable || 1`，否则报「起始桌号不对」。

**新一轮判定**：若整批数据**没有任何 result 且没有任何 timeExt**，则视为全新一轮——未在导入列表里的桌子全部刷白，轮数 +1。

---

## 5. 三种来源格式差异

`demo.html` 注释里写了「统一兼容 GEM / carde / melee 格式」，但当前插件**只实现了 GEM 和 melee 两个来源**。`carde` 应该是规划中的第三种（或 melee 的别称/旧称），目前插件未产出该格式。

| 维度 | GEM | melee.gg | EventLink（0.2.0） | carde |
|---|---|---|---|---|
| 站点 | `gem.fabtcg.com` | `melee.gg` | `eventlink.wizards.com` | （未实现） |
| `game` 字段 | `"fab"` | `"mtg"` | `"mtg"` | — |
| 抓取页面 | `/gem/{id}/report` | 配对表页 | 配对/成绩页 | — |
| 桌号选择器 | `.match-row .match-element[0]` | `.TableNumber-column` | `.pairings-table__cell--table-num` | — |
| 玩家名 | 正则 `^(.+) \((\d+)\)$` 从文本切 | `a.open-player-card-link` 文本 + `data-id` | `.team__text span` 文本（无 ID，输出 null） | — |
| 结果来源 | `<select>` 的 value + `#refresh` 上报列表交叉 | `.AdminResultString-column` 文本解析 | `.box-score` 的 winner/loser 类位置 | — |
| `result` 取值 | `1WIN/2WIN/DRAW/LOSSALL/null` | `1WIN/2WIN/BYE/null` | `1WIN/2WIN/DRAW/null` | — |
| `dropped` 判定 | `drops` class **或** `input[data-player]` 复选框 | 结果文本含「{名字} 退出比赛」 | `.team__text` 类含 `dropped` | — |
| `timeExtension` | **不输出** | 输出（来自 `.TimeExtensionMinutes-column input`） | **不输出**（固定 null） | — |
| 上报冲突检测 | 有（不一致置 `result=null`） | 无 | 无 | — |

**对前端的隐含约定**：
- 前端必须能容忍 `timeExtension` 字段缺失（GEM 来源）。
- 前端必须能容忍 `result` 取值集合是并集（`DRAW/LOSSALL/BYE` 都只来自单一来源）。
- 前端通过 `currentTournament.game` 自行决定如何解释 `result`，与插件的 `game` 字段无关。

---

## 6. 数据流向总览

```
┌─────────────────────────────────────────────────────────────┐
│ 用户浏览器                                                   │
│                                                             │
│  ┌──────────────┐   DOM 解析    ┌──────────────────────┐   │
│  │ gem.fabtcg   │ ───────────▶  │                      │   │
│  │  /report     │               │  Lynx 插件 popup     │   │
│  └──────────────┘               │  (Vue3 + scripting)  │   │
│                                 │                      │   │
│  ┌──────────────┐   DOM 解析    │  extractGemResults   │   │
│  │ melee.gg     │ ───────────▶  │  extractMeleeResults │   │
│  │  pairings    │               │  extractGemHeroes    │   │
│  └──────────────┘               └──────────┬───────────┘   │
│                                            │               │
│                              JSON.stringify │               │
│                                            ▼               │
│                                  ┌──────────────────┐      │
│                                  │ 系统剪贴板        │      │
│                                  └────────┬─────────┘      │
└───────────────────────────────────────────┼───────────────┘
                                            │ Ctrl+V
                                            ▼
┌─────────────────────────────────────────────────────────────┐
│ Lynx 网页（demo.html / 未来 web/）                            │
│  ┌────────────────────────────────────────────────────┐     │
│  │ 导入弹窗 <textarea id="import-text">                │     │
│  │   ↓ 用户点击「导入」                                │     │
│  │ applyImport() (demo.html:2513)                     │     │
│  │   ↓ JSON.parse → 字段标准化 → 桌号校验 → 状态写入   │     │
│  │ tableData[] → renderTables() → pushTables()        │     │
│  └────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

**关键特征**：
1. 插件与 Lynx 网页**完全解耦**，仅通过剪贴板 JSON 字符串通信。
2. 插件**不发起任何网络请求**到 Lynx 后端。
3. 前端只依赖 JSON 结构，不依赖插件内部实现。

---

## 7. 协议稳定性评估

| 项 | 评估 |
|---|---|
| 字段命名 | 稳定（camelCase，与前端标准化逻辑一一对应） |
| `result` 枚举 | 稳定（前端硬编码识别这 5 个值 + null） |
| `timeExtension` 类型 | **注意**：插件输出 string，前端 `parseInt` 兼容；未来若改 number 也兼容 |
| 必填字段 | `tableNumber` 是唯一强校验字段，其他都可空 |
| 数组顺序 | 前端不依赖顺序，按 `tableNumber` 索引 |

**结论**：当前协议对前端足够友好，**联机版前端可以直接复用 `applyImport()` 的标准化逻辑**，无需修改插件。
