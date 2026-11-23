# JudgeCall Web

JudgeCall 主站、内容页、下载页和赛事工具的开发仓库。

| 目录 | 内容与入口 |
|---|---|
| [Website](Website/README.md) | 主站。在 Windows PowerShell 中可执行 npm ci 和 npm run build:tencent。此构建会读取同级 Legal_Docs。 |
| [Lynx](Lynx) | 赛事管理网页、Node.js 服务和浏览器扩展。分别在 server、web、extension 执行 npm ci；启动命令及环境变量见各自 README，环境变量模板见 Lynx/.env.example。 |
| [SEP](SEP) | 赛事计划工具。在该目录运行 npm ci、npm run build、npm start。npm test 运行测试。 |
| [Downloads](Downloads/README.md) | 下载页和 Node.js 下载计数服务，安装包位于 Downloads/files。 |
| [Content](Content/README.md) | 静态内容站。 |
| [About](About)、[Compose](Compose)、[Games](Games)、[Legal_Docs](Legal_Docs)、[Logo](Logo) | 页面、文档、规则和共享素材。 |
| [Talishar](Talishar/README.md) | Nimblism 前端、PHP 引擎和上游来源记录。 |

使用前安装 Git、Git LFS 和 Node.js。Node.js 24 可用于主站、Lynx 和 SEP。安装 Git LFS 后克隆仓库；若已有克隆，可运行 git lfs install 和 git lfs pull 获取下载页的 APK 和 EXE。每台设备用自己的开发环境变量和数据库。

切换设备前提交并推送当前分支。在另一台设备打开同一分支并运行 git pull --ff-only。线上部署继续使用各模块现有的部署脚本和配置。
Nimblism 的 Metafy 指南接口由服务端环境变量 METAFY_API_KEY 配置。
