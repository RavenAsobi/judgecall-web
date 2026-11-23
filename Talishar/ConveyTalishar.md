# 复刻并自托管 Talishar：可行性、实施流程与 GPL-3.0 合规

> 调研日期：2026-07-29  
> 目标：基于 Talishar 的公开项目资源，在自己的域名和服务器上部署一个功能、交互尽量接近 talishar.net 的独立站点。  
> 重要提示：本文是工程与开源合规清单，不构成法律意见。公开上线、商业化或以商业实体运营前，应由熟悉所在地版权、商标和开源许可证的律师审阅，并取得 Legend Story Studios（LSS）对预定用途的书面确认。

## 1. 结论

### 1.1 技术结论

**可以以公开代码为基础制作自己的站点，但“克隆一个仓库即可 1:1 上线”不可行。**

Talishar 当前至少由三个相互配合的项目组成：

| 项目 | 作用 | 是否为运行核心 |
| --- | --- | --- |
| [Talishar/Talishar](https://github.com/Talishar/Talishar) | PHP 游戏引擎、规则逻辑、API、游戏状态持久化、MySQL/Redis/Docker 配置 | 是 |
| [Talishar/Talishar-FE](https://github.com/Talishar/Talishar-FE) | Vite + React + TypeScript + Redux 前端 | 是 |
| [Talishar/CardImages](https://github.com/Talishar/CardImages) | 卡图处理、管理和相关生成流程 | 对完整卡图体验及更新流程重要 |

后端 README 明确表示：后端与前端是分开的，本地运行需要两者；生成新卡牌和图片时，还会使用与它们同级放置的 CardImages 仓库。官方开发配置提供 Apache/PHP、MySQL、Redis 和 phpMyAdmin，但它是**开发起点，不是可原样暴露到互联网的生产栈**。

能够达到的目标：

- 在已开源、已实现的卡牌和功能范围内，复现 Talishar 的主要前端界面、建房、对战、游戏状态和规则处理体验。
- 使用自己的域名、服务器、品牌、账号体系配置和部署流水线。
- 持续同步上游更新，并保留自己的补丁。

不能仅凭公开仓库保证的目标：

- 与 talishar.net 某一时刻的生产环境完全一致。生产数据库内容、私有密钥、OAuth 应用、CDN、监控、反滥用规则、运营后台、第三方服务配置和未公开变更不一定在仓库中。
- 对所有卡牌、所有边界规则和线上并发能力作出完全等价保证。
- 获得 Talishar 名称、Logo、talishar.net 的商业外观或 LSS 卡图、角色、Logo、商标的独立授权。
- 因 GPL-3.0 而自动获得 Flesh and Blood 相关素材的使用权。

因此，本文所称“1:1 复刻”应解释为：**以公开源代码为基线，尽量保持公开功能和 UI 行为一致；品牌、域名、法律声明、密钥、基础设施和受第三方权利保护的素材必须独立处理。**

### 1.2 上线决策

建议采用以下闸门：

| 条件 | 结论 |
| --- | --- |
| 仅本机研究、开发、测试，不向第三方提供副本 | 可先实施；仍不得把第三方素材用于超出许可的用途 |
| 非商业个人/社区站点，使用 LSS 卡图并公开服务 | 技术上可实施；上线前应按 LSS 政策准备声明，并向 `ip@legendstory.com` 书面确认在线对战和素材使用 |
| 收会员费、订阅费、售卖功能/道具，或由商业实体运营 | **不要仅凭 GPL 和公开素材政策上线**；先取得 LSS 明确书面许可 |
| 使用 Talishar 名称、Logo，或造成“官方分站/授权站”印象 | 高风险；应重新命名、重新设计品牌并避免混淆，除非已取得权利人书面许可 |

## 2. 为什么 GPL 合规不等于整个站点都可合法复制

Talishar 仓库的 [`LICENSE Notes.txt`](https://github.com/Talishar/Talishar/blob/main/LICENSE%20Notes.txt) 明确说明：

- GPL 文件仅适用于 Talishar **源代码**。
- 卡图、修改后的卡图、卡名以及其他属于 LSS 的知识产权不因该 GPL 文件而获得授权。
- Flesh and Blood 的角色、卡牌、Logo 和美术素材属于 LSS。

LSS 当前的 [Terms of Use for Game and Studio Assets and IP](https://fabtcg.com/resources/terms-use-licensed-assets/) 进一步规定：

- 第三方应用许可是非独占、可撤销的。
- 非商业主体可创建相关服务、规则执行应用和 API；直接出售应用、订阅或应用内产品需要书面许可，政策允许的间接变现示例包括 Patreon 和广告。
- 商业实体不得仅依该公开条款创建第三方应用。
- 所有第三方应用必须展示指定的非关联声明。
- FAB Card Images 的使用需要展示 `© Legend Story Studios`，且权利和允许用途受该政策约束。
- 不得使用户误以为站点是 LSS、Flesh and Blood 或官方媒体/产品的一部分，也不得暗示认可或关联。
- 政策可随时更新，LSS 可撤回许可。

这意味着需要同时满足两套边界：

1. **软件代码边界**：Talishar、Talishar-FE、CardImages 的 GPL-3.0 条件。
2. **游戏 IP 边界**：LSS 对名称、商标、卡图、角色、文本、Logo、美术和第三方应用的政策，以及所在地法律。

还要单独核查：

- Talishar 自有名称、Logo、站点视觉标识是否可用于你的站点；GPL 通常不是商标许可。
- 字体、图标、音效、广告素材、第三方 API 和 npm/Composer 依赖各自的许可证。
- 隐私政策、Cookie、日志、聊天内容、用户账号、未成年人、数据跨境和删除请求等所在地合规要求。

## 3. GPL-3.0 的最低合规方案

三个 Talishar 项目在 GitHub 上均标记为 GPL-3.0。实施时应保留每个仓库自己的 `LICENSE`，不要只在总仓库放一份链接。

### 3.1 必须做的事

1. **保留通知**

   - 保留原始版权声明、GPL 声明、无担保声明和作者信息。
   - 不删除源码文件已有的许可证头、NOTICE、LICENSE Notes 或署名。
   - 分发代码、构建产物或容器时附带完整 GPL-3.0 文本。

2. **标注修改**

   - 在修改过的文件或统一的 `CHANGES.md` 中清楚说明你修改了什么和修改日期。
   - 推荐每次生产发布建立不可变 Git 标签，例如 `deploy-2026-07-29.1`，并记录三个上游基线 commit。

3. **同许可证发布衍生代码**

   - 对基于 GPL 代码形成的修改版或组合衍生作品，使用 GPL-3.0 许可。
   - 不得给接收者增加禁止复制、禁止修改、禁止再分发、NDA 或按席位限制等与 GPL 冲突的条件。
   - 你的独立作品是否构成“独立聚合”还是“组合衍生作品”要按实际耦合方式判断；不要仅凭把代码放到不同目录就假定可以闭源。

4. **提供完整对应源码**

   - 浏览器收到的打包 JavaScript 是向用户传送的程序副本。部署 `dist` 时，应给用户等价、免费、清晰的途径取得**与当前线上构建对应的完整源码**。
   - 完整对应源码至少包括：你部署的前端源码、你的修改、锁文件、构建脚本、配置模板、生成或安装该版本所需的自有脚本，以及适用的许可证文件。
   - 仅链接到 Talishar 上游仓库不够，因为上游没有你的修改，也可能不是当前部署版本。
   - 仅发布 diff 通常也不够；应保存可独立获取的完整版本快照。
   - 若分发后端容器、安装包、虚拟机镜像或其他非源码形式，也要按 GPL 第 6 节提供对应源码和清晰获取说明。

5. **展示法律信息**

   在站点页脚或“关于 / 法律”页面设置明显入口，至少包含：

   - 原项目和你的修改版版权说明。
   - “本程序不提供任何担保”的说明。
   - GPL-3.0 完整文本链接。
   - 当前线上版本对应的源码下载或 Git 标签链接。
   - 修改记录。
   - LSS 要求的非关联声明和素材版权声明。

### 3.2 仅通过网络运行后端时的特别说明

GPL-3.0 本身不是 AGPL。GPL 文本把“仅通过计算机网络与用户交互、没有向用户传送副本”排除在 convey（传送副本）之外；GNU 的 [GPL FAQ](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedMods) 也说明，仅在网站服务器运行修改后的 GPL 程序，通常不会仅因网络服务而触发后端源码发布义务。

但本项目仍建议公开后端的完整对应源码，原因是：

- React/JavaScript 前端确实会传送到浏览器，已经触发前端分发义务。
- 你可能向云服务商、运维方、客户或镜像仓库传送后端副本或容器。
- 前后端共同构成完整产品，统一公开能降低版本错配和合规争议。
- 上游本身采用开放协作模式，公开修改也便于持续同步。

最稳妥做法是：**每次上线同时发布前端、后端和 CardImages 修改版的完整源代码快照，三者都保留 GPL-3.0。**

### 3.3 推荐的站点法律页文本

以下是工作草案，正式上线前应按实体名称和律师意见调整：

```text
[你的应用名] 基于 Talishar 开源项目的修改版本。
本应用源代码依据 GNU General Public License version 3 发布。
当前运行版本的完整对应源代码、修改记录和许可证：
https://code.example.com/your-org/your-project/releases/tag/deploy-YYYY-MM-DD.N

本程序按“现状”提供，不附带任何担保；详见 GNU GPL v3。

[你的应用名] is in no way affiliated with Legend Story Studios.
Legend Story Studios®, Flesh and Blood™, and set names are trademarks of
Legend Story Studios. Flesh and Blood characters, cards, logos, and art are
property of Legend Story Studios.

© Legend Story Studios
```

如使用中文展示，建议同时保留 LSS 指定英文原文，避免翻译改变含义。

## 4. 推荐项目结构

不要直接把生产改动堆在某个上游工作树中。建议建立自己的总仓库或组织，并对三个上游分别保留可追溯 fork：

```text
ConveyTalishar/
├─ backend/                 # fork: Talishar/Talishar
├─ frontend/                # fork: Talishar/Talishar-FE
├─ card-images/             # fork: Talishar/CardImages
├─ deploy/
│  ├─ compose.prod.yml
│  ├─ nginx/
│  ├─ scripts/
│  └─ env.example
├─ legal/
│  ├─ GPL-3.0.txt
│  ├─ THIRD_PARTY_NOTICES.md
│  ├─ CHANGES.md
│  └─ SOURCE_OFFER.md
├─ docs/
│  ├─ architecture.md
│  ├─ operations.md
│  └─ rollback.md
└─ README.md
```

如果采用单仓库：

- 保留每个导入项目的提交历史和许可证。
- 在根目录说明各子目录的来源、上游 URL、基线 commit 和许可证。
- 不要在 Git 历史中提交 `.env`、数据库、私钥、OAuth secret、备份或用户数据。

如果采用三个 fork：

- 每个 fork 添加 `upstream` remote。
- 另建一个私密或公开的部署仓库存放基础设施；如果其中包含 GPL 程序构建所必需的自有脚本，也应纳入对应源码发布包。

## 5. 从零到本地可运行

### 5.1 准备环境

优先使用 Linux 或 WSL2。后端 README 明确提示类 Unix 环境更容易；Windows 的脚本换行也可能造成问题。

准备：

- Git
- Docker Engine 与 Docker Compose v2
- Node.js：按 Talishar-FE 当前 README 和 `.nvmrc` 确认版本；调研时 README 指定 `24.14.0`
- npm
- 可选：GNU Make、Bash、OpenSSL

### 5.2 建立可追溯 fork

先在你的 Git 托管平台创建三个 fork，再执行：

```bash
mkdir ConveyTalishar
cd ConveyTalishar

git clone https://github.com/YOUR_ORG/Talishar.git backend
git clone https://github.com/YOUR_ORG/Talishar-FE.git frontend
git clone https://github.com/YOUR_ORG/CardImages.git card-images

git -C backend remote add upstream https://github.com/Talishar/Talishar.git
git -C frontend remote add upstream https://github.com/Talishar/Talishar-FE.git
git -C card-images remote add upstream https://github.com/Talishar/CardImages.git

git -C backend rev-parse HEAD
git -C frontend rev-parse HEAD
git -C card-images rev-parse HEAD
```

将三个输出写入 `legal/CHANGES.md`，这就是首次复刻的上游基线。不要只记录 `main`，因为它会移动。

注意：上游开发脚本默认期望目录名和相对位置为 `Talishar`、`Talishar-FE`、`CardImages`。若改成上述目录名，需要同步修改 Compose 挂载和生成脚本；或者在首次验证阶段保持上游目录名，待测试通过后再整理结构。

### 5.3 启动后端开发环境

按上游的原始布局：

```bash
git clone https://github.com/YOUR_ORG/Talishar.git Talishar
git clone https://github.com/YOUR_ORG/Talishar-FE.git Talishar-FE
git clone https://github.com/YOUR_ORG/CardImages.git CardImages

cd Talishar
cp -n HostFiles/RedirectorTemplate.php HostFiles/Redirector.php
docker compose up -d
docker compose ps
docker compose logs --tail=200 web-server mysql-server redis
```

当前上游 Compose 的开发端口为：

- 后端：`8080:80`
- phpMyAdmin：`5001:80`
- Redis：`6382:6379`

后端容器还会挂载 `../Talishar-FE`。这些默认值只用于隔离的本地开发环境。

### 5.4 启动前端

```bash
cd ../Talishar-FE
cp .env.template .env.local
npm ci
npm run dev
```

当前 README 给出的默认访问地址是 `http://localhost:5173/`，后端默认在 `localhost:8080`。

`.env.local` 的关键项来自上游 `.env.template`：

```dotenv
VITE_ENV="dev"
VITE_BACKEND_URL="localhost"
VITE_BACKEND_PORT="8080"
VITE_BACKEND_DIRECTORY="game"
VITE_DATADOLL_URL="localhost"
VITE_DATADOLL_PORT="8090"
VITE_ROGUELIKE_URL="localhost"
VITE_ROGUELIKE_PORT="8080"
VITE_ROGUELIKE_DIRECTORY="game"
VITE_FREEZE_GAME=false
VITE_METAFY_CLIENT_ID="YOUR_OWN_CLIENT_ID"
```

不要沿用上游生产域名或假定上游 OAuth Client ID 可用于你的回调地址。为自己的域名注册 OAuth 应用；若暂时不需要相关登录功能，应显式禁用或移除入口。

### 5.5 本地验收

至少完成：

- 创建账号或匿名身份流程。
- 创建公开和私有游戏。
- 两个浏览器会话进入同一局。
- 选择英雄、导入牌组、起手、行动、响应、攻击、防御、结算和结束游戏。
- 断线重连、刷新、超时、投降和回放。
- 聊天输入的 XSS、超长内容和速率限制测试。
- 不同屏幕宽度和移动设备测试。
- 后端重启、Redis 重启、MySQL 重启后的恢复行为。
- 前端控制台无未处理错误；API 不泄露绝对路径、SQL、密钥或堆栈。
- 用自动化测试覆盖你修改过的规则、API 和核心 UI。

## 6. 先做品牌与素材隔离

在进入生产前完成以下改造：

1. 选择不包含 `Talishar`、`Flesh and Blood` 或近似官方标识的独立应用名和域名，除非已获书面许可。
2. 替换 Talishar Logo、favicon、社交分享图、页面标题、邮件模板和官方风格宣传素材。
3. 不使用 LSS Logo；FAB Logo 的允许用途受 LSS 政策严格限制，第三方应用不应把它当成自己的应用 Logo。
4. 在登录页、页脚、关于页和法律页展示非关联声明。
5. 每个使用卡图或 LSS 素材的适当页面展示 `© Legend Story Studios`。
6. 建立素材清单，逐项记录：

   - 文件路径和内容哈希
   - 来源 URL
   - 权利人
   - 适用政策/许可证
   - 是否允许修改
   - 是否允许直接或间接变现
   - 是否需要署名/免责声明
   - 最后复核日期

7. 向 `ip@legendstory.com` 提交书面说明，至少包含：

   - 运营主体是个人、非营利组织还是商业实体
   - 域名和应用名
   - 在线规则执行和对战功能
   - 使用哪些卡图、卡名、规则文本和其他素材
   - 是否有广告、Patreon、捐赠、订阅、付费功能或赞助
   - 数据/API 是否向第三方开放
   - 拟展示的免责声明
   - 请求确认该具体用途是否获准

保存回复和条款快照；设置季度复核 LSS 政策的日历任务。

## 7. 生产部署设计

### 7.1 推荐拓扑

```text
用户浏览器
    │ HTTPS
    ▼
CDN/WAF（可选）
    │
    ▼
Nginx / Caddy（宿主机或独立容器）
    ├─ play.example.com  → 前端静态 dist
    └─ api.example.com   → 127.0.0.1:8080 → Apache/PHP
                                      ├─ MySQL（仅内部网络）
                                      └─ Redis（仅内部网络）
```

也可把前端和 API 放在同一域名下，用 `/api/` 反向代理，以减少 CORS、Cookie 和 OAuth 回调复杂度。采用哪种方式取决于代码中现有 URL 拼装和 Cookie 策略，必须在预生产环境验证。

### 7.2 生产 Compose 不可直接照搬开发文件

上游 Compose 在调研时包含：

- MySQL root 用户和明文默认密码 `secret`
- phpMyAdmin 公开映射到 `5001`
- Redis 公开映射到 `6382`
- 后端源代码和 Xdebug 配置以宿主机目录挂载
- 开发用 OAuth Client ID 和 `DOMAIN=localhost`

生产改造要求：

- 使用 `deploy/compose.prod.yml`，不要修改后仍误称为上游原版。
- MySQL 使用独立低权限应用用户和随机长密码；root 密码单独保管。
- 密钥只通过受保护的环境文件、Docker secret 或云密钥服务注入。
- 不把 MySQL、Redis、phpMyAdmin 端口发布到公网。
- phpMyAdmin 默认不部署；紧急运维时通过 VPN、SSH 隧道或短时受控 profile 启用。
- 关闭 Xdebug，启用合适的生产 PHP 配置和 OPcache。
- 后端只绑定宿主机回环地址，例如 `127.0.0.1:8080:80`，由反向代理接入。
- 固定镜像版本或 digest，不使用不可审计的 `latest`。
- 为容器设置健康检查、资源限制、日志轮转和重启策略。
- 将数据库、游戏状态和必要上传目录放入明确的持久卷；构建产物只读。
- 根据实际文件写入路径设置最小文件权限，不把整个代码目录设为全局可写。

示意片段：

```yaml
services:
  web-server:
    build:
      context: ../backend
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:8080:80"
    env_file:
      - .env.production
    depends_on:
      mysql-server:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  mysql-server:
    image: mysql:<PINNED_VERSION>
    env_file:
      - .env.production
    volumes:
      - mysql-data:/var/lib/mysql
      - ../backend/Database:/docker-entrypoint-initdb.d:ro
    restart: unless-stopped

  redis:
    image: redis:<PINNED_VERSION>
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redis-data:/data
    restart: unless-stopped

volumes:
  mysql-data:
  redis-data:
```

这只是安全方向示例，不能不经核对就替换上游文件。必须根据当前 commit 的实际环境变量、容器名称、健康检查能力和写入目录完成最终文件。

### 7.3 构建前端

创建只包含公开配置的生产环境文件。`VITE_*` 值会进入浏览器构建产物，**绝不能放入 secret**。

```bash
cd frontend
npm ci
npm test --if-present
npm run build
```

检查 `dist/`：

```bash
grep -R "localhost\|talishar.net\|secret\|PRIVATE KEY" dist
```

将 `dist` 发布到 Nginx、对象存储/CDN 或独立静态容器。为单页应用配置 fallback 到 `index.html`，同时确保 API 路径不被 fallback 吞掉。

### 7.4 反向代理和 TLS

Nginx 示意：

```nginx
server {
    listen 443 ssl http2;
    server_name play.example.com;

    root /srv/convey/frontend-dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location = /legal/source {
        return 302 https://code.example.com/your-org/your-project/releases/tag/DEPLOY_TAG;
    }
}

server {
    listen 443 ssl http2;
    server_name api.example.com;

    client_max_body_size 2m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
```

生产要求：

- 为自己的域名签发证书；不要复制上游文档中的 `talishar.net`、`api.talishar.net` 等域名。
- 强制 HTTPS、设置 HSTS 前先确认所有子域都支持 HTTPS。
- 配置 CSP、`X-Content-Type-Options`、`Referrer-Policy` 和合适的 frame 限制。
- SSE、长轮询或 WebSocket 如被当前代码使用，要为对应路径设置正确的缓冲和超时策略。
- CORS 只允许自己的前端域名，不使用宽泛的 `*` 配合凭据。
- Cookie 使用 `Secure`、`HttpOnly` 和合适的 `SameSite`。

### 7.5 数据库与迁移

- 先在空数据库验证 `backend/Database` 初始化脚本。
- 对生产数据执行迁移前创建一致性备份。
- 为迁移写向前和回滚说明，不直接在运行中的数据库试错。
- 定期备份 MySQL、必要游戏状态和用户上传；Redis 是否备份取决于其是否仅作缓存。
- 对备份执行加密、保留期和实际恢复演练。
- 不把数据库导出加入公开源码包。

### 7.6 账号、OAuth 和外部服务

- 为自己的域名创建 OAuth 应用和回调 URL。
- 不复制上游 secret、Webhook、Discord token、广告账户、分析 ID 或生产 API key。
- 浏览器可见 Client ID 不等于 secret，但也必须属于你的应用。
- 未配置的第三方功能要在 UI 和后端同时关闭，避免半可用入口。
- 将外部服务故障设计为可降级，不能让登录/广告接口故障破坏核心对战。

## 8. 建议的发布流水线

### 8.1 每次发布

1. 从三个上游获取更新：

   ```bash
   git -C backend fetch upstream
   git -C frontend fetch upstream
   git -C card-images fetch upstream
   ```

2. 在独立分支合并或 rebase，解决冲突后运行测试。
3. 更新 `legal/CHANGES.md`，记录：

   - 三个上游旧/新 commit
   - 你的 commit
   - 用户可见变化
   - 数据库变更
   - 素材变更
   - 安全和许可证变更

4. 生成 SBOM 和依赖许可证报告；人工检查 GPL 不兼容或缺少许可证的新增依赖。
5. 构建前端和后端镜像，使用 commit SHA 标签，不使用 `latest` 作为唯一标识。
6. 部署到预生产环境，运行双浏览器端到端测试和一轮真实对局。
7. 创建 Git 标签：

   ```bash
   git tag -s deploy-YYYY-MM-DD.N -m "Production deployment YYYY-MM-DD.N"
   git push origin deploy-YYYY-MM-DD.N
   ```

8. 为该标签发布完整源码归档、GPL 文本、第三方通知、构建说明和校验和。
9. 确认站点“源代码”链接指向这次部署标签，而不是 `main`。
10. 备份数据库，滚动部署，执行烟雾测试。

### 8.2 源码发布包

建议每次发布产出：

```text
release/
├─ convey-talishar-source-DEPLOY_TAG.tar.gz
├─ convey-talishar-source-DEPLOY_TAG.tar.gz.sha256
├─ GPL-3.0.txt
├─ THIRD_PARTY_NOTICES.md
├─ CHANGES.md
├─ BUILD.md
└─ SBOM.spdx.json
```

源码归档必须来自与生产构建相同的标签。仓库链接可作为下载途径，但应确保它长期可访问，并保留与线上每个对象代码版本对应的标签。

## 9. 安全与运营最低线

公开在线卡牌服务会处理不可信输入并维持大量游戏状态。上线前至少完成：

- 依赖和容器镜像漏洞扫描。
- PHP 静态分析、TypeScript lint、单元测试和端到端测试。
- SQL 注入、XSS、路径遍历、任意文件读写、反序列化和上传验证审计。
- 登录、建房、聊天、牌组导入、API 和错误报告的速率限制。
- CSRF、CORS、Cookie、会话固定和账号枚举检查。
- 管理端和封禁接口强认证、审计日志与最小权限。
- 隐藏 PHP/Apache 版本和生产堆栈信息。
- WAF/CDN、DDoS 基础防护和连接数限制。
- 监控 CPU、内存、磁盘、MySQL 连接、Redis 内存、HTTP 5xx、响应时间和对局失败率。
- 日志去敏，不记录密码、token、完整 Cookie、私聊或不必要的个人数据。
- 数据保留、导出和删除流程；发布隐私政策和服务条款。
- 漏洞报告邮箱和响应流程。
- 定期恢复演练与经过测试的回滚版本。

官方仓库提供 `SECURITY.md`，但你是自己部署版本的运营者，必须建立自己的安全联系和补丁 SLA。

## 10. “1:1”验收矩阵

不要以页面截图相似作为完成标准。建立以下矩阵并逐项记录“上游支持 / 已复刻 / 有差异 / 不在范围”：

| 领域 | 验收内容 |
| --- | --- |
| 首页与导航 | 路由、登录状态、法律入口、移动端 |
| 身份 | 匿名/账号、OAuth、登出、会话失效 |
| 牌组 | 导入、验证、格式限制、错误提示 |
| 大厅 | 建房、筛选、密码房、观战、匹配状态 |
| 对局 | 起手、优先权、行动、响应、攻击、防御、结算 |
| 区域 | 手牌、牌库、墓地、放逐区、装备、武器、场上区域 |
| 卡牌规则 | 已实现卡池、触发、替代效果、连续效果和边界情况 |
| 实时性 | 轮询/SSE、重连、多标签页、超时 |
| 社交 | 聊天、屏蔽、举报、内容安全 |
| 回放 | 生成、读取、版本兼容、隐私 |
| 管理 | 封禁、审计、异常对局和工单 |
| 非功能 | 并发、延迟、可用性、备份、恢复、安全 |
| 合规 | GPL、源码链接、修改说明、LSS 声明、素材清单 |

对每个生产版本保存一份测试报告，并记录不等价项。不要宣传“完全准确”或“官方规则裁决”；Talishar 本身也声明游戏交互和判例不能替代 LSS 与裁判的正式裁定。

## 11. 上线前最终检查表

### 代码与 GPL

- [ ] 三个仓库的上游 URL、基线 commit 和本次部署 commit 已记录
- [ ] 原始版权、许可证、无担保声明和 `LICENSE Notes.txt` 未删除
- [ ] 修改内容和日期已清楚标注
- [ ] 修改版按 GPL-3.0 发布，没有增加冲突限制
- [ ] 每个仓库包含完整 GPL-3.0 文本
- [ ] 当前前端构建的完整对应源码可免费、清晰下载
- [ ] 后端、容器和部署脚本的对应源码/构建说明已发布
- [ ] 源码链接指向不可变部署标签
- [ ] 第三方依赖许可证和 SBOM 已审查

### LSS、品牌与素材

- [ ] 已使用独立名称、域名、Logo 和视觉标识
- [ ] 没有造成官方、授权、附属或认可关系的印象
- [ ] 已展示 LSS 指定的第三方应用免责声明
- [ ] 使用卡图处已展示 `© Legend Story Studios`
- [ ] 已建立逐文件素材来源和许可清单
- [ ] 运营主体和变现方式符合当前 LSS 政策
- [ ] 已就在线对战、卡图使用和变现方式取得 LSS 书面确认
- [ ] 已保存 LSS 政策快照和确认邮件

### 生产安全

- [ ] MySQL/Redis/phpMyAdmin 未暴露到公网
- [ ] 所有默认密码、上游密钥和示例 Client ID 已替换
- [ ] Xdebug 已关闭，错误堆栈不返回给用户
- [ ] TLS、CORS、Cookie、CSP、速率限制已验证
- [ ] 备份、恢复、监控、报警和回滚已演练
- [ ] 隐私政策、服务条款、漏洞联系和数据删除流程已发布
- [ ] 预生产双客户端完整对局和负载测试通过

## 12. 维护策略

建议每两周检查一次三个上游，每次新卡集发布时加密集同步：

```bash
git -C backend fetch upstream --prune
git -C frontend fetch upstream --prune
git -C card-images fetch upstream --prune
```

同步原则：

- 上游逻辑更新与本地品牌/基础设施改动分支隔离。
- 尽量向上游提交通用 bug 修复，减少长期 fork 成本。
- 卡牌规则变更必须有测试和版本说明。
- 不自动把新卡图推到生产；先复核 LSS 政策、素材来源和免责声明。
- 每季度复核 GPL 流程、LSS 政策、依赖许可证和公开法律页。
- 对任何 LSS 撤销通知或权利投诉预设快速下架素材和暂停服务流程。

## 13. 主要依据

- [Talishar 后端仓库与 README](https://github.com/Talishar/Talishar)
- [Talishar-FE 前端仓库与 README](https://github.com/Talishar/Talishar-FE)
- [CardImages 仓库](https://github.com/Talishar/CardImages)
- [Talishar docker-compose.yml](https://github.com/Talishar/Talishar/blob/main/docker-compose.yml)
- [Talishar LICENSE](https://github.com/Talishar/Talishar/blob/main/LICENSE)
- [Talishar LICENSE Notes.txt](https://github.com/Talishar/Talishar/blob/main/LICENSE%20Notes.txt)
- [GNU GPL version 3 正文](https://www.gnu.org/licenses/gpl-3.0.html)
- [GNU GPL FAQ：网站运行修改版与 JavaScript 分发](https://www.gnu.org/licenses/gpl-faq.en.html#UnreleasedMods)
- [GNU GPL FAQ：完整对应源码](https://www.gnu.org/licenses/gpl-faq.en.html#DistributingSourceIsInconvenient)
- [GNU GPL FAQ：对象代码和源码的网络提供方式](https://www.gnu.org/licenses/gpl-faq.en.html#AnonFTPAndSendSources)
- [LSS：Terms of Use for Game and Studio Assets and IP](https://fabtcg.com/resources/terms-use-licensed-assets/)

---

**最终建议：**先完成不含生产用户的技术 PoC；同时将独立品牌、LSS 书面确认、GPL 完整源码发布和生产安全加固作为四个并列的上线前置条件。任何一个未完成，都不应把“本地能运行”视为“可以公开 1:1 运营”。
