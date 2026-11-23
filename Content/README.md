# content.judgecall.net

这是 `content.judgecall.net` 的静态内容站点。生产环境由 Nginx 托管，部署配置位于 `deploy/nginx-content-https.conf`。

## 更新内容

- 在 `content-data.js` 的 `videos` 数组中维护轮播视频的 BV 号、标题、UP 主与本地封面。
- 在 `content-data.js` 的 `creators` 数组中维护六位创作者的名称、简介、头像、标签与链接。
- 头像路径建议放在 `assets/creators/` 下，并使用相对路径，例如 `./assets/creators/example.webp`。

## 本地预览

在本目录运行任意静态文件服务器，例如：

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。
