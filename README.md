# Mote · 碎记

从 Tessera 的便签模块独立出来的个人记录应用。打开就写，按 `⌘↵` 保存；标签、搜索、编辑、回收站、草稿和 JSON 导入导出均保留，不包含热力图。

- 网页和 Raycast/Tinycast 读取、写入同一个 RN SQLite 数据库。
- 网页用访问密码登录；插件使用只允许新增记录的专用令牌，失败可重试且不会重复记录。
- 服务与 Tessera 完全分离，不连接或修改 Tessera 数据；可以通过网页导入既有 Ripple 备份，保留 ID、日期、历史版本，冲突整批回滚。

## 当前入口

服务部署在 RN `/opt/mote`，只监听服务器 `127.0.0.1:4174`。本机运行：

```sh
npm run server:connect
```

保持此终端运行，浏览器打开 [http://127.0.0.1:5174](http://127.0.0.1:5174)。密码在本机 `output/login.md`（不入 Git）。关闭连接不影响服务器保存的记录。域名尚未启用。

Tinycast 搜索 `Send to Mote`。默认通过 `ssh rn` 发送到 RN，无需网页隧道持续运行。插件代码、安装和设置见 [raycast-extension/README.md](raycast-extension/README.md)。

## 本地开发

Node.js 24.12+：

```sh
npm ci
cp .env.example .env.local
# 在 .env.local 设置至少 16 位随机 MOTE_PASSWORD
npm run dev
```

本地开发数据保存在 `data/mote.sqlite`，与 RN 数据独立。不要同时占用隧道与开发服务的 5174 端口。

```sh
npm run typecheck
npm run lint
npm test
npm run build
```

## 部署与维护

```sh
npm run deploy
```

先完成检查，再上传构建产物到 RN。使用独立容器、160 MiB 内存上限、持久卷与自动重启。更新前在线备份 SQLite 和配置；更新失败回退镜像及配置，保留新写入的数据。历史版本在 `/opt/mote/releases/`，备份在 `/opt/mote/backups/` 与 `/opt/mote/data/pre-deploy-*.sqlite`。

`MOTE_PASSWORD` 在 RN `/opt/mote/.env`，0600 权限；更改密码后需手动删除 `mote_sessions` 中的会话使已有登录失效。令牌在网页重新生成会立即撤销旧令牌。

启用 `mote.caten.top` 前：添加 DNS，在 Caddy 添加该域名的 `reverse_proxy mote:4174`，将容器接入 `caddy_net` 并设置 `MOTE_COOKIE_SECURE=true`。继续保持主机端口只绑定回环地址；密码与令牌通过 HTTPS 发送。当前 SSH 方案已可完整使用。
