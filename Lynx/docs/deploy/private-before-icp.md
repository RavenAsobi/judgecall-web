# Lynx 备案前私有部署（Ubuntu / 中国大陆）

目标：代码和数据库先部署到腾讯云，但备案完成前不通过公网域名提供网页服务。Nginx 只监听服务器回环地址，管理员通过 SSH 隧道访问 `http://127.0.0.1:8080`；访问根路径时直接打开 Beta 页面。

## 1. 公网边界

- 腾讯云安全组只开放 SSH（TCP 22），来源限制为管理员固定公网 IP。
- 暂不开放 TCP 80、443、3000、8080。
- `lynx.judgecall.net` 可以保留现有解析，但备案完成前不要让站点监听公网 80/443。
- 应用进程只监听 `127.0.0.1:3000`，私有 Nginx 只监听 `127.0.0.1:8080`。

修改 SSH 或防火墙规则时，先保留当前 SSH 会话，再开第二个会话验证，避免把自己锁在服务器外。

## 2. 准备 Ubuntu

服务器需要 Node.js 22 LTS、npm、Nginx、rsync 和 PM2。确认版本：

```bash
node --version
npm --version
nginx -v
```

安装系统组件和 PM2：

```bash
sudo apt update
sudo apt install -y nginx rsync sqlite3
sudo npm install -g pm2
sudo mkdir -p /var/www/lynx/uploads /var/www/lynx/shared/data /var/www/lynx/shared/backups
sudo chown -R "$USER":"$USER" /var/www/lynx
```

## 3. 上传代码

在 Windows PowerShell 执行（替换用户名和服务器 IP）：

```powershell
scp -r "D:\JudgeCall-Web\Lynx" ubuntu@服务器IP:/var/www/lynx/uploads/
```

上传后的源码目录应为 `/var/www/lynx/uploads/Lynx`，并包含 `server/package-lock.json` 和 `web/package-lock.json`。

## 4. 配置机密

```bash
cp /var/www/lynx/uploads/Lynx/.env.example /var/www/lynx/shared/.env
chmod 600 /var/www/lynx/shared/.env
cd /var/www/lynx/uploads/Lynx/server
npm ci --omit=dev
npm run hash-password
nano /var/www/lynx/shared/.env
```

把交互式脚本输出的 bcrypt 值填入 `SUPER_PASSWORD_HASH=`。不要把明文密码或 `.env` 放进源码目录、聊天记录或 Git。

备案前建议配置：

```ini
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
DB_PATH=/var/www/lynx/shared/data/lynx.db
SUPER_PASSWORD_HASH=<上一步生成的 bcrypt 值>
SESSION_TTL_HOURS=72
CORS_ORIGINS=http://127.0.0.1:8080
```

## 5. 发布应用

```bash
cd /var/www/lynx/uploads/Lynx
chmod +x docs/deploy/scripts/deploy-release.sh
./docs/deploy/scripts/deploy-release.sh /var/www/lynx/uploads/Lynx
pm2 status
pm2 logs lynx --lines 100
curl http://127.0.0.1:3000/api/health
```

首次部署后执行 `pm2 startup`，再按它打印的命令配置开机启动，最后执行：

```bash
pm2 save
```

PM2 固定单实例运行，并在每周一 04:00 重启一次。SQLite 和内存中的 WebSocket 房间不支持多实例并发。

## 6. 启用私有 Nginx

```bash
sudo cp /var/www/lynx/current/docs/deploy/scripts/nginx-private.conf /etc/nginx/sites-available/lynx-private
sudo ln -sfn /etc/nginx/sites-available/lynx-private /etc/nginx/sites-enabled/lynx-private
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
curl -I http://127.0.0.1:8080/
```

从本机建立 SSH 隧道：

```powershell
ssh -N -L 8080:127.0.0.1:8080 ubuntu@服务器IP
```

保持窗口运行，然后在本机打开 `http://127.0.0.1:8080/`。根路径应显示 `lynx-beta.html`，API 和 WebSocket 也走同一隧道。

## 7. 更新与回滚

每次重新上传新版源码后：

```bash
/var/www/lynx/uploads/Lynx/docs/deploy/scripts/deploy-release.sh /var/www/lynx/uploads/Lynx
```

脚本会创建时间戳版本目录、完成构建后原子切换 `/var/www/lynx/current`，并保留旧版本。查看版本：

```bash
ls -lt /var/www/lynx/releases
readlink -f /var/www/lynx/current
```

回滚时把 `current` 指向确认过的旧版本，再重载 PM2：

```bash
ln -sfn /var/www/lynx/releases/<旧版本目录> /var/www/lynx/current.next
mv -Tf /var/www/lynx/current.next /var/www/lynx/current
cd /var/www/lynx/current
pm2 reload ecosystem.config.cjs --update-env
```

## 8. 备案完成后再公开

1. 在页面底部加入真实备案号，并链接到 `https://beian.miit.gov.cn/`。
2. 确认 `lynx.judgecall.net` 解析到当前服务器。
3. 安全组开放 TCP 80/443，仍不要开放 3000/8080。
4. 先签发证书：

   ```bash
   sudo certbot certonly --standalone -d lynx.judgecall.net
   ```

5. 启用 `docs/deploy/scripts/nginx-public-after-icp.conf`，停用 `lynx-private`，执行 `sudo nginx -t` 后重载。
6. 验证 HTTPS、登录、FAB 赛制计时、WebSocket 和证书自动续期。

备案完成前不要执行本节，也不要通过域名或公网 IP 对外提供网页访问。
