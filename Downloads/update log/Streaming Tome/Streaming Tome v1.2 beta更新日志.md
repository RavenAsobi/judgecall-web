# Streaming Tome v1.2 Beta 更新日志

> 发布日期：2026 年 8 月 20 日  
> 适用平台：Windows 10 / Windows 11

Streaming Tome v1.2 Beta 聚焦于卡牌内容扩充、直播画面易读性、品牌统一和现场操作效率。本次更新在保留现有本地运行、局域网 Life Tracker 与 OBS Browser Source 工作方式的基础上，进一步完善了比赛控制、卡牌展示和多语言选手姓名支持。

## 版本亮点

- MPW 与 AOL 系列卡牌内容已整合进本地卡库。
- Match Overlay 的英雄头像、生命值、计时器和左右对称布局全面优化。
- 卡牌文字现可正确解析 Markdown，并显示 Flesh and Blood 属性图标。
- 软件品牌视觉已统一，桌面窗口、网页、EXE 与任务栏均使用新版 logo。
- Card Reference Console 改为按需加载，软件启动更轻量。
- Match Control 与 Overlay 现可正确显示中文、日文、韩文等非英文选手姓名。

## 卡牌内容更新

### MPW 与 AOL 系列

MPW 和 AOL 两个系列的卡牌数据与卡图已按照现有离线卡库标准完成更新和整合，可直接用于：

- Card Reference Console 卡牌搜索；
- 独立卡图展示窗口；
- 本地卡牌文字查询；
- 英雄选择与 Match Overlay 头像显示。

当前本地数据库包含 2,926 条卡牌记录，并已完成缺图、无效文件与重复记录检查。软件运行时完全使用本地数据，不需要连接外部卡牌 API。

### 英雄头像显示优化

Overlay 中的英雄头像现在会以正方形区域显示，并自动截取卡图中的主体画面，不再露出卡牌边框、名称或其他文字信息，使直播画面更接近正式赛事转播风格。

## Match Control 与直播 Overlay

### 生命值区域重新设计

- 原有的 `HP` 文字已替换为 Health 图标。
- 左侧玩家的 Health 图标位于生命值左侧，右侧玩家的图标位于生命值右侧。
- 图标与生命值数字之间保留了清晰的视觉间距。
- 移除了生命值区域边框，并扩大左右两侧可用空间，降低数字被遮挡或裁切的风险。
- 比赛记录位置同步向两侧调整，使左右玩家信息保持轴对称。
- 修复了生命值变化动画放大时超出显示区域的问题。

### 计时器与布局

- 放大了 `ROUND TIMER` 标签字号，提高远距离观看时的辨识度。
- 保持原有计时、加时、Untimed Round、主题、自定义颜色与尺寸调整功能。

### 多语言选手姓名

当玩家姓名中出现中文、日文、韩文或其他非英文字符时，Match Control 输入框与 Overlay 中对应的姓名会自动切换为“微软雅黑”，避免出现缺字或方框。

纯英文姓名仍使用原有界面和直播字体；当姓名恢复为纯英文时，字体也会自动切回。字体选择在 Overlay 缩放、主题切换和比赛状态同步后仍会正确保留。

## 卡牌文字显示

### Markdown 解析修复

卡牌规则文字现可正确显示常用 Markdown 格式，包括：

- `#` 标题；
- `*斜体*`；
- `**粗体**`。

### Flesh and Blood 属性图标

规则文字中的属性标记现在会转换为对应图标：

| 标记  | 显示内容  |
| ----- | --------- |
| `{h}` | Health    |
| `{p}` | Power     |
| `{i}` | Intellect |
| `{d}` | Defense   |
| `{t}` | Tap       |
| `{u}` | Untap     |
| `{c}` | Chi       |
| `{r}` | Resource  |

图标会嵌入规则文字并与文本基线对齐，适用于英文及本地翻译内容（本地翻译内容待更新）。

## 品牌视觉更新

新版 Streaming Tome logo 已应用至：

- Match Control；
- Card Reference Console；
- 卡牌文字窗口；
- 网页 Life Tracker；
- 浏览器页签图标；
- Windows 窗口与任务栏；
- 最终发布的 EXE 文件。

针对深色界面，logo 使用白色圆角矩形地衬，以保持清晰对比。Card Reference Console 中的 logo 同时缩小为更紧凑的尺寸，为卡牌搜索区域释放更多空间。

Windows 运行时图标与 EXE 内嵌图标现使用同一品牌资源，并采用新的应用身份配置，减少任务栏继续显示旧图标的情况。

## 启动与窗口操作改进

### Card Reference Console 按需加载

启动 Streaming Tome 时默认只打开 Match Control。卡牌数据库、翻译表和 Card Reference Console 相关窗口会在首次点击 `OPEN CARD CONSOLE` 时才加载，减少启动阶段不必要的初始化工作。

### 独立窗口开关

- 关闭 Card Reference Console 不再关闭整个程序或停止 Life Tracker。
- 可随时通过 Match Control 中的 `OPEN CARD CONSOLE` 按钮重新打开。
- 如果 Card Reference Console 已经打开或处于最小化状态，按钮会将其恢复并显示到前端。
- Card Reference Console 中仍可使用 `OPEN LIFE TRACKER` 返回 Match Control。

## 稳定性与兼容性

- 保留现有 LAN Life Tracker、WebSocket 同步和 OBS Browser Source 地址格式。
- 保留 Overlay 透明背景、16:1 比例、Always on Top 与自定义尺寸功能。
- 网页静态资源加入版本标识，覆盖升级后会自动刷新样式，降低旧浏览器缓存造成的显示异常。
- 已完成 29 项自动化测试，以及桌面窗口、网页 Life Tracker、直播 Overlay 和打包版 EXE 的实际运行验证。

## 升级说明

1. 关闭正在运行的旧版 Streaming Tome。
2. 使用 v1.2 Beta 的 `Streaming Tome.exe` 替换旧版本并重新启动。
3. 原有 OBS Browser Source 地址和常用设置可以继续使用。
4. 如果任务栏上固定的旧快捷方式仍显示旧图标，请先取消固定旧图标，再运行新版 EXE 并重新固定。

---

Streaming Tome v1.2 Beta 继续坚持离线优先与局域网运行原则：卡牌查询、规则文字、英雄头像和比赛数据均在本地处理，比赛状态不会上传或持久化到外部服务。
